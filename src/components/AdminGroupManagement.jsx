import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  ref,
  onValue,
  update,
  remove,
  set,
  get,
} from "firebase/database";

export default function AdminGroupManagement() {
  const [userMap, setUserMap] = useState({});
  const [groupSize, setGroupSize] = useState(4);
  const [refreshMinutes, setRefreshMinutes] = useState(10);
  const [generatedGroups, setGeneratedGroups] = useState({});
  const [status, setStatus] = useState("pending");
  const [expiresAt, setExpiresAt] = useState(null);
  const [remainingTime, setRemainingTime] = useState(null);
  const [expectedEndTime, setExpectedEndTime] = useState(null);

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

    (async () => {
      const snapshot = await get(ref(db, "id"));
      const data = snapshot.val() || {};
      const grouped = {};

      Object.entries(data).forEach(([id, user]) => {
        if (user.group) {
          if (!grouped[user.group]) grouped[user.group] = [];
          grouped[user.group].push({ id, name: user.name });
        }
      });

      if (Object.keys(grouped).length > 0) {
        setGeneratedGroups(grouped);
        setStatus("published");
      }
    })();
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

  const handleStartRefresh = () => {
    const now = Date.now();
    const expected = now + refreshMinutes * 60 * 1000;
    setExpectedEndTime(expected);
  };

  const unassigned = Object.entries(userMap)
    .filter(([_, u]) => !u.group)
    .map(([id, u]) => ({ id, name: u.name }));

  const regenerateGroups = () => {
    const allUsers = Object.entries(userMap).map(([id, u]) => ({ id, name: u.name }));
    const shuffled = [...allUsers].sort(() => Math.random() - 0.5);

    const result = {};
    let groupIndex = 0;

    for (let i = 0; i < shuffled.length; i++) {
      const groupName = `Group ${String.fromCharCode(65 + groupIndex)}`;
      if (!result[groupName]) result[groupName] = [];
      result[groupName].push(shuffled[i]);

      if (result[groupName].length >= groupSize) {
        groupIndex++;
      }
    }

    const lastGroupKey = `Group ${String.fromCharCode(65 + groupIndex)}`;
    if (
      result[lastGroupKey] &&
      result[lastGroupKey].length === 1 &&
      Object.keys(result).length > 1
    ) {
      const otherGroups = Object.keys(result).filter((g) => g !== lastGroupKey);
      const donorGroup = otherGroups[Math.floor(Math.random() * otherGroups.length)];
      const donorMembers = result[donorGroup];
      const randomIndex = Math.floor(Math.random() * donorMembers.length);
      const moved = donorMembers.splice(randomIndex, 1)[0];
      result[lastGroupKey].push(moved);
    }

    setGeneratedGroups(result);
    setStatus("ready");
  };

  const assignNewMembers = () => {
    if (unassigned.length === 0) return;

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

    const updates = {};
    unassigned.forEach((user) => {
      const minCount = Math.min(...groupCounts.map((g) => g.count));
      const candidates = groupCounts.filter((g) => g.count === minCount);
      const selected = candidates[Math.floor(Math.random() * candidates.length)];

      updates[`/id/${user.id}/group`] = selected.groupName;
      selected.count += 1;
    });

    update(ref(db), updates);
  };

const publishGroups = async () => {
  const updates = {};
  const newExpires = Date.now() + refreshMinutes * 60 * 1000;

  setExpiresAt(newExpires);
  setExpectedEndTime(newExpires);

  Object.entries(generatedGroups).forEach(([groupName, members]) => {
    members.forEach((member) => {
      updates[`/id/${member.id}/group`] = groupName;
    });
  });

  await update(ref(db), updates);
  await set(ref(db, "nextTime/nexttime"), newExpires).then(()=>{
    setExpectedEndTime(null);
  });

  alert("배포 완료!");
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

  return (
    <div className="admin-group-management">
        <div className="container">
            <h2>Amex Grouping Admin Page</h2>

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
                <label>조별 인원 수:</label>
                <input type="number" value={groupSize} onChange={(e) => setGroupSize(Number(e.target.value))} />
                
                <label>리프레시 시간(분):</label>
                <input type="number" value={refreshMinutes} onChange={(e) => setRefreshMinutes(Number(e.target.value))} />
                
                <button onClick={handleStartRefresh}>⏱ 시간 재설정</button>
                <button onClick={assignNewMembers} disabled={unassigned.length === 0}>➕ 새 멤버 그룹 배정</button>
                <button onClick={regenerateGroups}>♻️ 전체 그룹 재배정</button>
                <button onClick={publishGroups}>✅ 최종 배포</button>
                <button className="danger" onClick={resetDatabase}>🔥 전체 DB 초기화</button>
            </div>
        </div>

      <h3>포함되지 않은 유저 ({unassigned.length})</h3>
      <ul>
        {unassigned.map((u) => (
          <li key={u.id}>
            {u.name}
            <button onClick={() => deleteUser(u.id)} style={{ marginLeft: 10 }}>
              삭제
            </button>
          </li>
        ))}
      </ul>

      <hr/>

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

      {status === "published" && (
        <div style={{ marginTop: 40 }}>
          <h3>배정 결과</h3>
          {(() => {
            const grouped = Object.entries(userMap)
              .filter(([_, u]) => u.group)
              .reduce((acc, [id, user]) => {
                if (!acc[user.group]) acc[user.group] = [];
                acc[user.group].push({ id, name: user.name });
                return acc;
              }, {});

            return Object.entries(grouped).map(([group, members]) => (
              <div key={group}>
                <h4>{group}</h4>
                <ul>
                  {members.map((u) => (
                    <li key={u.id}>
                      {u.name}
                      <button
                        onClick={() => deleteUser(u.id)}
                        style={{ marginLeft: 10 }}
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}
