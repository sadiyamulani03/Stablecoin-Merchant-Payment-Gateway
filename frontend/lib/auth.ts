"use client";
export function getToken(){if(typeof window==="undefined")return null;return localStorage.getItem("gateway_token");}
export function saveSession(token:string,merchantId:string,name?:string){localStorage.setItem("gateway_token",token);localStorage.setItem("merchant_id",merchantId);if(name)localStorage.setItem("merchant_name",name);}
export function clearSession(){localStorage.removeItem("gateway_token");localStorage.removeItem("merchant_id");localStorage.removeItem("merchant_name");}
export function authHeaders():Record<string,string>{const token=getToken();return token?{Authorization:`Bearer ${token}`}:{};}
