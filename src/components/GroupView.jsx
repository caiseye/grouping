import React, { useEffect, useState } from "react";
import { db } from "../firebase";
import { ref, onValue } from "firebase/database";
import "../GroupView.css";

export default function GroupView() {
  const [userMap, setUserMap] = useState({});
  const [grouped, setGrouped] = useState({});
  const [expiresAt, setExpiresAt] = useState(null);
  const [remainingTime, setRemainingTime] = useState(null);

  const username = localStorage.getItem("username");
  const userId = localStorage.getItem("userid");
  const me = userId && userMap[userId] ? userMap[userId] : null;

  useEffect(() => {
    const idRef = ref(db, "id");
    onValue(idRef, (snapshot) => {
      const data = snapshot.val() || {};
      setUserMap(data);
    });
  }, []);

  useEffect(() => {
    const nextRef = ref(db, "nextTime");
    onValue(nextRef, (snapshot) => {
      const data = snapshot.val() || {};
      const latest = Math.max(...Object.values(data));
      setExpiresAt(latest);
    });
  }, []);

  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setRemainingTime(diffSec);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  useEffect(() => {
    const groupedData = {};
    Object.entries(userMap).forEach(([_, user]) => {
      if (user.group) {
        if (!groupedData[user.group]) groupedData[user.group] = [];
        groupedData[user.group].push(user.name);
      }
    });
    setGrouped(groupedData);
  }, [userMap]);

  const formatTime = (sec) => {
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  return (
    <div className="container">
      <h2 className="title">👋 {username} Amax 원우님 환영합니다</h2>
      <p className="timer">
        ⏳ Remain Time: <span>{remainingTime !== null ? formatTime(remainingTime) : "--:--"}</span>
      </p>

      {me && me.group ? (
        <>
          <div className="card my-group">
            <h3>🧩 당신의 조: {me.group}</h3>
            <ul>
              {grouped[me.group]?.map((name, idx) => (
                <li key={idx}>{name} 원우님</li>
              ))}
            </ul>
          </div>

          <div className="section">
            <h3>📋 다른 조 목록</h3>
            {Object.entries(grouped)
              .filter(([group]) => group !== me.group)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([group, members]) => (
                <div key={group} className="card">
                  <h4>조 {group}</h4>
                  <ul>
                    {members.map((name, idx) => (
                      <li key={idx}>{name} 원우님</li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </>
      ) : (
        <div className="card waiting">
          <h3>⏳ 조 배정 대기 중</h3>
          <p>조 배정이 끝나면 자동으로 결과가 표시됩니다.</p>
        </div>
      )}
    </div>
  );
}
