function r(a,e={}){const t=localStorage.getItem("kado_token");return fetch(a,{...e,headers:{...e.headers||{},...t?{Authorization:`Bearer ${t}`}:{}}})}export{r as a};
