import {readFile,readdir} from "node:fs/promises";
import {validateEdition} from "./edition.ts";
for(const name of (await readdir("site/editions")).filter(n=>n.endsWith(".json")).sort()){
 const d=JSON.parse(await readFile(`site/editions/${name}`,"utf8"));validateEdition(d);
 if(name!==`${d.date}.json`)throw new Error("Edition filename must match date");console.log(`${d.date}: ${d.items.length} verified source records`);
}
