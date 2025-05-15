import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBYWUqKGGXYq38DeppUdvnXVwIXY0oxvqI",
  authDomain: "grouping01-88755.firebaseapp.com",
  databaseURL: "https://grouping01-88755-default-rtdb.firebaseio.com",
  projectId: "grouping01-88755",
  storageBucket: "grouping01-88755.firebasestorage.app",
  messagingSenderId: "602598164824",
  appId: "1:602598164824:web:a65ce7b0a59717bc257d2d",
  measurementId: "G-SE8H2VVKTB"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db };


