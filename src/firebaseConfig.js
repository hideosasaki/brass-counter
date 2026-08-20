import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAnalytics } from "firebase/analytics";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

// Web app config and the reCAPTCHA site key are public identifiers,
// not secrets. Access control lives in database.rules.json.
const firebaseConfig = {
  apiKey: "AIzaSyB8ko3Qf8YF8JtPGLAqytsNEwJdcdvM6Ow",
  authDomain: "brass-counter.firebaseapp.com",
  projectId: "brass-counter",
  storageBucket: "brass-counter.appspot.com",
  messagingSenderId: "340027296696",
  appId: "1:340027296696:web:741a4e9a24333a6239dd4d",
  measurementId: "G-ZHL9F0DNS9",
  databaseURL: "https://brass-counter-default-rtdb.firebaseio.com/",
};

const app = initializeApp(firebaseConfig);

getAnalytics(app);

initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider("6LfzUiYqAAAAAGb6hgidzGqcNsJCZY0xNvVPy59S"),
  isTokenAutoRefreshEnabled: true,
});

export const database = getDatabase(app);
