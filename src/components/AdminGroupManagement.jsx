import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  ref,
  onValue,
  update,
  remove,
  set,
} from "firebase/database";

export default function AdminGroupManagement() {
  const [userMap, setUserMap] = useState({});                   // DB에서 가져온 유저오브젝트
  const [status, setStatus] = useState("pending");              // 유저별 그룹지정상태 pending, ready

  const [groupSize, setGroupSize] = useState(4);                // 그룹구성원 수 
  const [groupCount, setGroupCount] = useState(5);              // 그룹수(선착순에서만 사용)
  const [refreshMinutes, setRefreshMinutes] = useState(60);     // 그룹 리프레쉬 시간(분 단위)
  const [generatedGroups, setGeneratedGroups] = useState({});   // 그룹 재생성
  
  const [expiresAt, setExpiresAt] = useState(null);             // 종료시각
  const [remainingTime, setRemainingTime] = useState(null);     // 리프레쉬까지 남은 시간
  const [expectedEndTime, setExpectedEndTime] = useState(null); // 예상종료시각

  const [mode, setMode] = useState("firstcome");                // 일괄: batch, 선착순: firstcome
  const [watchRealtime, setWatchRealtime] = useState(false);    // 실시간

    useEffect(() => {
        const usersRef = ref(db, "users");
        onValue(usersRef, (snapshot) => {
            const data = snapshot.val() || {};
            setUserMap(data);
        });

        const nextRef = ref(db, "nextTime/nexttime");
        onValue(nextRef, (snapshot) => {
            const value = snapshot.val();
            if (value) setExpiresAt(value);
        });
    }, []);

    useEffect(() => {
        if (!expiresAt) return;
        const interval = setInterval(() =>  {
            const now = Date.now();
            const diffSec = Math.max(0, Math.floor((expiresAt - now) / 1000));
            setRemainingTime(diffSec);
            if (diffSec <= 0) {
            regenerateGroups();
            handleExpectedRefresh();
            clearInterval(interval);
            setTimeout(()=>{publish();}, 500);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [expiresAt]);

    useEffect(() => {
    if (watchRealtime && mode === "firstcome") {
        const usersRef = ref(db, "users");
        const unsub = onValue(usersRef, (snapshot) => {
        const data = snapshot.val() || {};
        const newUsers = Object.entries(data).filter(([_, u]) => !u.group);
        if (newUsers.length > 0) {
            const currentGroups = {};
            Object.entries(data).forEach(([_, u]) => {
            if (u.group) {
                if (!currentGroups[u.group]) currentGroups[u.group] = 0;
                currentGroups[u.group]++;
            }
            });
            const updates = {};
            newUsers.forEach(([id, user]) => {
            const candidates = [];
            for (let i = 0; i < groupCount; i++) {
                const g = `Group ${String.fromCharCode(65 + i)}`;
                if ((currentGroups[g] || 0) < groupSize) {
                candidates.push(g);
                }
            }
            if (candidates.length > 0) {
                const selected = candidates[Math.floor(Math.random() * candidates.length)];
                updates[`/users/${id}/group`] = selected;
                currentGroups[selected] = (currentGroups[selected] || 0) + 1;
            }
            });
            if (Object.keys(updates).length > 0) update(ref(db), updates);
        }
        });
        return () => unsub();
    }
    }, [watchRealtime, mode, groupCount, groupSize]);

    const handleExpectedRefresh = () => {
        const now = Date.now();
        const expected = now + refreshMinutes * 60 * 1000;
        setExpectedEndTime(expected);
    };

    const regenerateGroups = () => {
        const allUsers = Object.entries(userMap).map(([id, u]) => ({ id, name: u.name, birth: u.birth }));
        const shuffled = [...allUsers].sort(() => Math.random() - 0.5);
        const total = shuffled.length;

        // 선착순 모드
        if (mode === "firstcome") {
            const result = {};
            for (let i = 0; i < groupCount; i++) {
                const groupName = `Group ${String.fromCharCode(65 + i)}`;
                result[groupName] = [];
            }

            for (const user of shuffled) {
                const candidateGroups = Object.entries(result)
                    .filter(([_, members]) => members.length < groupSize)
                    .map(([groupName]) => groupName);

                if (candidateGroups.length === 0) break;

                const randomIndex = Math.floor(Math.random() * candidateGroups.length);
                const chosenGroup = candidateGroups[randomIndex];
                result[chosenGroup].push(user);
            }

            setGeneratedGroups(result);
            setStatus("ready");
            return;
        }


        // batch 모드
        let maxGroups = Math.ceil(total / groupSize);
        while (maxGroups > 0) {
            const baseSize = Math.floor(total / maxGroups);
            const extra = total % maxGroups;

            if (baseSize === 1 && extra === 0) {
                maxGroups--;
                continue;
            }

            const result = {};
            let index = 0;
            let remain = extra;

            for (let i = 0; i < maxGroups; i++) {
                const size = baseSize + (remain > 0 ? 1 : 0);
                const groupName = `Group ${String.fromCharCode(65 + i)}`;
                result[groupName] = shuffled.slice(index, index + size);
                index += size;
                if (remain > 0) remain--;
            }

            setGeneratedGroups(result);
            setStatus("ready");
            return;
        }

        alert("그룹을 생성할 수 없습니다. 설정을 확인해주세요.");
    };

    // 최종배포
    // 1. 그룹이름을 DB에 저장
    // 2. 그룹별 유저를 DB에 저장
    // 3. DB에 저장된 유저의 그룹을 업데이트
    const publish = async () => {
        const updates = {};

        // 새로운 종료예상시간이 셋팅되어있을경우 시간 셋팅
        if (expectedEndTime != null){
            handleExpectedRefresh
            setExpiresAt(expectedEndTime);
            await set(ref(db, "nextTime/nexttime"), expectedEndTime)
            setExpectedEndTime(null)
        }

        if (mode === "firstcome") {
            if (status === "ready" && Object.keys(generatedGroups).length > 0) {
            Object.entries(generatedGroups).forEach(([groupName, members]) => {
                members.forEach((member) => {
                updates[`/users/${member.id}/group`] = groupName;
                });
            });
            } else {
            Object.entries(userMap).forEach(([id, user]) => {
                if (user.group) {
                updates[`/users/${id}/group`] = user.group;
                }
            });
            }

            await update(ref(db), updates);
            
            setWatchRealtime(true);
            alert("배포 완료");
            setStatus("published");
            return;
        }

        if (status === "ready") {
            Object.entries(generatedGroups).forEach(([groupName, members]) => {
            members.forEach((member) => {
                updates[`/users/${member.id}/group`] = groupName;
            });
            });
        } else {
            const grouped = {};
            Object.values(userMap).forEach((u) => {
            if (u.group) {
                if (!grouped[u.group]) grouped[u.group] = [];
                grouped[u.group].push(u);
            }
            });

            const groupCounts = Object.entries(grouped).map(([groupName, members]) => ({
            groupName,
            count: members.length,
            }));

            const unassigned = Object.entries(userMap)
            .filter(([_, u]) => !u.group)
            .map(([id, u]) => ({ id, name: u.name, birth: u.birth }));

            unassigned.forEach((user) => {
            const minCount = Math.min(...groupCounts.map((g) => g.count));
            const candidates = groupCounts.filter((g) => g.count === minCount);
            const selected = candidates[Math.floor(Math.random() * candidates.length)];
            updates[`/users/${user.id}/group`] = selected.groupName;
            selected.count += 1;
            });
        }

        await update(ref(db), updates);

        alert("배포 완료!");
        setStatus("published");
    };

    const deleteUser = async (userId) => {
        if (window.confirm("정말로 이 원우를 삭제하시겠습니까?")) {
            await remove(ref(db, `users/${userId}`));
        }
    };

    const resetDatabase = async () => {
        if (window.confirm("[WARNING]전체 데이터를 초기화하시겠습니까?")) {
            await set(ref(db, "/"), {});
            alert("DB 초기화 완료");
        }
    };

    const formatTime = (sec) => {
        const mm = String(Math.floor(sec / 60)).padStart(2, "0");
        const ss = String(sec % 60).padStart(2, "0");
        return `${mm}:${ss}`;
    };

    const unassigned = Object.entries(userMap)
    .filter(([_, u]) => !u.group)
    .map(([id, u]) => ({ id, name: u.name, birth: u.birth }));

    return (
        <div className="admin-group-management" style={{ padding: 30, fontFamily: "sans-serif", maxWidth: 800, margin: "0 auto" }}>
                <div style={{ border: "1px solid #ccc", borderRadius: 12, padding: 24, backgroundColor: "#f9f9f9" }}>
                    <h2 style={{ textAlign: "center", marginBottom: 20 }}>Amax Grouping Admin Page</h2>

                    <div style={{ marginBottom: 20 }}>
                    <label><b>모드 선택: </b></label>
                    <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ padding: 4, marginLeft: 8 }}>
                        <option value="batch">일괄모드</option>
                        <option value="firstcome">선착순모드</option>
                    </select>
                    </div>

                    <div className="control-panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {(mode === "batch" || mode === "firstcome") && (
                        <>
                        {mode === "firstcome" && (
                            <>
                            <label>
                                전체 그룹 수:
                                <input type="number" value={groupCount} onChange={(e) => setGroupCount(Number(e.target.value))} style={{ width: "5ch", marginLeft: 8 }} />
                            </label>
                            </>
                        )}
                        <label>
                            조별 인원 수:
                            <input type="number" value={groupSize} onChange={(e) => setGroupSize(Number(e.target.value))} style={{ width: "5ch", marginLeft: 8 }} />
                        </label>
                        <button onClick={regenerateGroups} style={{ padding: "6px 12px", borderRadius: 6 }}>그룹 재배정</button>
                        {expiresAt && (
                            <p style={{ marginTop: 20 }}>
                            Next Refresh Time: {new Date(expiresAt).toLocaleTimeString()}
                            {expectedEndTime && (
                                <span style={{ color: "red", marginLeft: 10 }}>
                                → Expected Refresh Time: {new Date(expectedEndTime).toLocaleTimeString()}
                                </span>
                            )}
                            <br />
                            Remain Time: {remainingTime !== null ? formatTime(remainingTime) : "계산 중..."}
                            </p>
                        )}
                        <label>
                        리프레시 시간(분):
                        <input type="number" value={refreshMinutes} onChange={(e) => setRefreshMinutes(Number(e.target.value))} style={{ width: "5ch", marginLeft: 8 }} />
                        </label>
                        <button onClick={handleExpectedRefresh} style={{ padding: "6px 12px", borderRadius: 6 }}>시간 재설정</button>
                    </>
                    )}
                    <button onClick={publish} style={{ padding: "8px 12px", backgroundColor: "#920023", color: "white", borderRadius: 6, border: "none" }}>최종 배포</button>
                    <button onClick={resetDatabase} style={{ padding: "8px 12px", backgroundColor: "#dc3545", color: "white", borderRadius: 6, border: "none" }}>전체 DB 초기화</button>
                </div>
            </div>

            <div style={{ marginTop: 30 }}>
                <h3>포함되지 않은 유저 ({unassigned.length})</h3>
                <ul>
                    {unassigned.map((u) => (
                    <li key={u.id}>
                        {u.name}({u.birth})
                        <button onClick={() => deleteUser(u.id)} style={{ marginLeft: 10, color: "red" }}>삭제</button>
                    </li>
                    ))}
                </ul>
            </div>

            {status === "ready" && Object.keys(generatedGroups).length > 0 && (
                <div style={{ marginTop: 30 }}>
                    <h3>[배포전] 예정 그룹</h3>
                    {Object.entries(generatedGroups).map(([group, members]) => (
                    <div key={group} style={{ marginTop: 10 }}>
                        <h4>{group}</h4>
                        <ul>
                        {members.map((u) => (
                            <li key={u.id}>{u.name}({u.birth})</li>
                        ))}
                        </ul>
                    </div>
                    ))}
                </div>
            )}

            <div style={{ marginTop: 40 }}>
                <h3>배정 결과</h3>
                {(() => {
                const grouped = {};
                Object.entries(userMap).forEach(([id, user]) => {
                    if (user.group) {
                    if (!grouped[user.group]) grouped[user.group] = [];
                    grouped[user.group].push({ id, name: user.name, birth: user.birth });
                    }
                });

                return Object.entries(grouped)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([group, members]) => (
                    <div key={group} style={{ marginBottom: 20 }}>
                        <h4>{group}</h4>
                        <ul>
                        {members.map((u) => (
                            <li key={u.id}>
                            {u.name}({u.birth})
                            <button onClick={() => deleteUser(u.id)} style={{ marginLeft: 10, color: "red" }}>삭제</button>
                            </li>
                        ))}
                        </ul>
                    </div>
                    ));
                })()}
            </div>
        </div>
    );
}
