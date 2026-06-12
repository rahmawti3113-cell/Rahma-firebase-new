import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyClDtdqmkYd81Q37iAxaySjlHvbjmRLKdk",
  authDomain: "rahmawati-f85d2.firebaseapp.com",
  databaseURL: "https://rahmawati-f85d2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "rahmawati-f85d2",
  storageBucket: "rahmawati-f85d2.firebasestorage.app",
  messagingSenderId: "924832191047",
  appId: "1:924832191047:web:5f8df52c9c328acbc55762",
  measurementId: "G-R86FMNM39Q"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();