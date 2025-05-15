import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { ref, push, set } from "firebase/database";


export default function UserRegister() {
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newRef = push(ref(db, "id"));

    await set(newRef, {
      name,
      group: "",
      nexttime: ""
    });

    localStorage.setItem("username", name);
    localStorage.setItem("userid", newRef.key);
    navigate("/group");
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.imageBox}>
          <img src="/grouping/amexMot.png" style={styles.image} />
        </div>

        <h2 style={styles.title}>이름을 입력하세요</h2>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름"
            style={styles.input}
          />
          <button type="submit" style={styles.button}>입장</button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    backgroundColor: "#f4f4f4",
    padding: "20px",
    boxSizing: "border-box"
  },
  card: {
    width: "100%",
    maxWidth: "400px",
    backgroundColor: "#fff",
    padding: "30px",
    borderRadius: "12px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.1)"
  },
  imageBox: {
    width: "100%",
    height: "180px",
    marginBottom: "20px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: "8px"
  },
  image: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain"
  },
  title: {
    marginBottom: "20px",
    textAlign: "center",
    fontSize: "1.5rem",
    color: "#333"
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "15px"
  },
  input: {
    padding: "12px",
    fontSize: "1rem",
    borderRadius: "6px",
    border: "1px solid #ccc"
  },
  button: {
    padding: "12px",
    fontSize: "1rem",
    backgroundColor: "crimson",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer"
  }
};
