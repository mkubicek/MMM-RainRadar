"use strict";
const fs=require("fs"),path=require("path"),acorn=require("acorn");
const root=path.join(__dirname,"..");
const files=["MMM-RainRadar.js","node_helper.js"].concat(["lib","public","demo"].reduce((list,dir)=>list.concat(fs.readdirSync(path.join(root,dir)).filter(f=>f.endsWith(".js")).map(f=>dir+"/"+f)),[]));
files.forEach(file=>acorn.parse(fs.readFileSync(path.join(root,file),"utf8"),{ecmaVersion:2018}));
console.log("ES2018 compatibility checked: "+files.length+" JavaScript files");
