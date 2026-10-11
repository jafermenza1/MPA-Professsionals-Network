"use client";
import {create} from "zustand";
type Mode="light"|"dark";
type State={mode:Mode;token:string;hydrated:boolean;language:string;queue:number;setMode:(mode:Mode)=>void;setToken:(token:string)=>void;clearToken:()=>void;clearSession:()=>void;hydrateToken:()=>void;setLanguage:(language:string)=>void;addQueue:()=>void;setQueue:(count:number)=>void};
const TOKEN_KEY="mpa-session-token";
export const useUiStore=create<State>((set)=>({
  mode:"light",
  token:"",
  hydrated:false,
  language:"en",
  queue:0,
  setMode:(mode)=>{if(typeof document!=="undefined")document.documentElement.classList.toggle("dark",mode==="dark");set({mode})},
  setToken:(token)=>{
    if(typeof window!=="undefined"){
      if(token) window.sessionStorage.setItem(TOKEN_KEY,token);
      else window.sessionStorage.removeItem(TOKEN_KEY);
    }
    set({token,hydrated:true});
  },
  clearToken:()=>{
    if(typeof window!=="undefined")window.sessionStorage.removeItem(TOKEN_KEY);
    set({token:"",hydrated:true});
  },
  clearSession:()=>{
    if(typeof window!=="undefined")window.sessionStorage.removeItem(TOKEN_KEY);
    set({token:"",hydrated:true});
  },
  hydrateToken:()=>{
    if(typeof window==="undefined")return;
    set({token:window.sessionStorage.getItem(TOKEN_KEY)||"",hydrated:true});
  },
  setLanguage:(language)=>set({language}),
  addQueue:()=>set(s=>({queue:s.queue+1})),
  setQueue:(count)=>set({queue:Math.max(0,Math.floor(count))})
}));
