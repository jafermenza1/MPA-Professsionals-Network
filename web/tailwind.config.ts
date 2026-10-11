import type {Config} from "tailwindcss";
const config:Config={content:["./app/**/*.{ts,tsx}","./components/**/*.{ts,tsx}"],darkMode:["class"],theme:{extend:{colors:{navy:"#123B6D",lemon:"#D9E85B",emerald:"#123B6D",obsidian:"#0f172a",gold:"#D9E85B"},fontFamily:{sans:["Inter","Noto Sans Ethiopic","system-ui","sans-serif"]},boxShadow:{soft:"0 10px 35px rgba(15,23,42,.08)"}}}};
export default config;