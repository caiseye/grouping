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
  const [userMap, setUserMap] = useState({});
  const [groupSize, setGroupSize] = useState(4);
  const [groupCount, setGroupCount] = useState(3);
  const [refreshMinutes, setRefreshMinutes] = useState(10);
  const [generatedGroups, setGeneratedGroups] = useState({});
  const [status, setStatus] = useState("pending");
  const [expiresAt, setExpiresAt] = useState(null);
  const [remainingTime, setRemainingTime] = useState(null);
  const [expectedEndTime, setExpectedEndTime] = useState(null);
  const [mode, setMode] = useState("batch");
  const [watchRealtime, setWatchRealtime] = useState(false);

  useEffect(() => {
    const idRef = ref(db, "id");
    onValue(idRef, (snapshot) => {
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
    const interval = setInterval(() => {
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setRemainingTime(diffSec);
      if (diffSec <= 0) {
        regenerateGroups();
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  useEffect(() => {
    if (watchRealtime && mode === "firstcome") {
      const idRef = ref(db, "id");
      const unsub = onValue(idRef, (snapshot) => {
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
              updates[`/id/${id}/group`] = selected;
              currentGroups[selected] = (currentGroups[selected] || 0) + 1;
            }
          });
          if (Object.keys(updates).length > 0) update(ref(db), updates);
        }
      });
      return () => unsub();
    }
  }, [watchRealtime, mode, groupCount, groupSize]);

  const handleStartRefresh = async () => {
    const now = Date.now();
    const expected = now + refreshMinutes * 60 * 1000;
    setExpectedEndTime(expected);
    setExpiresAt(expected);
    await set(ref(db, "nextTime/nexttime"), expected);
  };

  const regenerateGroups = () => {
    const allUsers = Object.entries(userMap).map(([id, u]) => ({ id, name: u.name }));
    const shuffled = [...allUsers].sort(() => Math.random() - 0.5);

    const result = {};
    const baseSize = Math.floor(shuffled.length / groupCount);
    let extra = shuffled.length % groupCount;
    let index = 0;

    for (let i = 0; i < groupCount; i++) {
      const size = baseSize + (extra > 0 ? 1 : 0);
      const groupName = `Group ${String.fromCharCode(65 + i)}`;
      result[groupName] = shuffled.slice(index, index + size);
      index += size;
      if (extra > 0) extra--;
    }

    setGeneratedGroups(result);
    setStatus("ready");
  };

  const publishGroups = async () => {
    const updates = {};
    const newExpires = Date.now() + refreshMinutes * 60 * 1000;
    setExpiresAt(newExpires);
    setExpectedEndTime(newExpires);

    if (mode === "firstcome") {
      if (status === "ready" && Object.keys(generatedGroups).length > 0) {
        Object.entries(generatedGroups).forEach(([groupName, members]) => {
          members.forEach((member) => {
            updates[`/id/${member.id}/group`] = groupName;
          });
        });
      } else {
        Object.entries(userMap).forEach(([id, user]) => {
          if (user.group) {
            updates[`/id/${id}/group`] = user.group;
          }
        });
      }
      await update(ref(db), updates);
      await set(ref(db, "nextTime/nexttime"), newExpires);
      setWatchRealtime(true);
      alert("선착순 배포 완료 (DB 반영됨)");
      setStatus("published");
      return;
    }

    if (status === "ready") {
      Object.entries(generatedGroups).forEach(([groupName, members]) => {
        members.forEach((member) => {
          updates[`/id/${member.id}/group`] = groupName;
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
        .map(([id, u]) => ({ id, name: u.name }));

      unassigned.forEach((user) => {
        const minCount = Math.min(...groupCounts.map((g) => g.count));
        const candidates = groupCounts.filter((g) => g.count === minCount);
        const selected = candidates[Math.floor(Math.random() * candidates.length)];
        updates[`/id/${user.id}/group`] = selected.groupName;
        selected.count += 1;
      });
    }

    await update(ref(db), updates);
    await set(ref(db, "nextTime/nexttime"), newExpires).then(() => {
      setExpectedEndTime(null);
    });

    alert("일괄모드 배포 완료!");
    setStatus("published");
  };

  const deleteUser = async (userId) => {
    if (window.confirm("정말로 이 유저를 삭제하시겠습니까?")) {
      await remove(ref(db, `id/${userId}`));
    }
  };

  const resetDatabase = async () => {
    if (window.confirm("⚠️ 전체 데이터를 초기화하시겠습니까?")) {
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
    .map(([id, u]) => ({ id, name: u.name }));

  return (
    <div className="admin-group-management">
      <div className="container">
        <h2>Amex Grouping Admin Page</h2>

        <label>모드 선택: </label>
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="batch">일괄모드</option>
          <option value="firstcome">선착순모드</option>
        </select>

        {expiresAt && (
          <p>
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

        <div className="control-panel">
          {(mode === "batch" || mode === "firstcome") && (
            <>
              {mode === "firstcome" && (
                <>
                  <label>전체 그룹 수:</label>
                  <input type="number" value={groupCount} onChange={(e) => setGroupCount(Number(e.target.value))} />
                </>
              )}
              <label>조별 인원 수:</label>
              <input type="number" value={groupSize} onChange={(e) => setGroupSize(Number(e.target.value))} />
              <label>리프레시 시간(분):</label>
              <input type="number" value={refreshMinutes} onChange={(e) => setRefreshMinutes(Number(e.target.value))} />
              <button onClick={handleStartRefresh}>⏱ 시간 재설정</button>
              <button onClick={regenerateGroups}>♻️ 그룹 재배정</button>
            </>
          )}
          <button onClick={publishGroups}>✅ 최종 배포</button>
          <button className="danger" onClick={resetDatabase}>🔥 전체 DB 초기화</button>
        </div>
      </div>

      <h3>포함되지 않은 유저 ({unassigned.length})</h3>
      <ul>
        {unassigned.map((u) => (
          <li key={u.id}>
            {u.name}
            <button onClick={() => deleteUser(u.id)} style={{ marginLeft: 10 }}>삭제</button>
          </li>
        ))}
      </ul>

      {status === "ready" && Object.keys(generatedGroups).length > 0 && (
        <div style={{ marginTop: 30 }}>
          <h3>확인중: 생성된 그룹</h3>
          {Object.entries(generatedGroups).map(([group, members]) => (
            <div key={group}>
              <h4>{group}</h4>
              <ul>
                {members.map((u) => (
                  <li key={u.id}>{u.name}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 40 }}>
        <h3>배정 결과 (실시간 DB 기준)</h3>
        {(() => {
          const grouped = {};
          Object.entries(userMap).forEach(([id, user]) => {
            if (user.group) {
              if (!grouped[user.group]) grouped[user.group] = [];
              grouped[user.group].push({ id, name: user.name });
            }
          });

          return Object.entries(grouped)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([group, members]) => (
              <div key={group}>
                <h4>{group}</h4>
                <ul>
                  {members.map((u) => (
                    <li key={u.id}>
                      {u.name}
                      <button onClick={() => deleteUser(u.id)} style={{ marginLeft: 10 }}>삭제</button>
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
