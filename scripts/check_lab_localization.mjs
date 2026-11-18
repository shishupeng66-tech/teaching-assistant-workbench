/** 对实际渲染文本做静态漏译检查，保留化学式、单位与内部枚举，不重写业务ID。 */
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(path.join(root,'frontend/package.json'));const parser=require('@babel/parser');
const dir=path.join(root,'frontend/src/features/chemistry-lab'),dict=JSON.parse(fs.readFileSync(path.join(dir,'locales/zh-CN.json'),'utf8'));
const files=[];function list(p){for(const n of fs.readdirSync(p)){const f=path.join(p,n);if(fs.statSync(f).isDirectory())list(f);else if(/\.(tsx|ts)$/.test(f))files.push(f)}}list(dir);files.push(path.join(root,'frontend/src/pages/ChemistryLab.tsx'));
const errors=[],allowed=/^(?:kJ\/mol|[\s\d.:=+−–→↑↓⁺⁻()（）\[\]%,×∶]*|[A-Z][a-z]?(?:[₂₃₄₅₆₇₈₉0-9⁺⁻]|[A-Z][a-z]?)*|[ns][₁₂₃₄₅⁰¹²³⁴⁵⁶⁷⁸⁹0-9]+|e⁻)$/;
let calls=0;
for(const file of files){const ast=parser.parse(fs.readFileSync(file,'utf8'),{sourceType:'module',plugins:['typescript','jsx']});function visit(n,parent){if(!n||typeof n!=='object')return;
 if(n.type==='CallExpression'&&n.callee?.name==='t'&&n.arguments[0]?.type==='StringLiteral'){calls++;if(!(n.arguments[0].value in dict))errors.push(`${file}:${n.loc.start.line}: missing ${n.arguments[0].value}`)}
 if(n.type==='JSXText'){const value=n.value.trim();if(value&&/[A-Za-z\p{Script=Han}]/u.test(value)&&!allowed.test(value)&&!['0.0 s','2H₂O(l) → 2H₂(g) + O₂(g)'].includes(value))errors.push(`${file}:${n.loc.start.line}: raw JSX text ${value}`)}
 if(n.type==='StringLiteral'&&/[\p{Script=Han}]/u.test(n.value))errors.push(`${file}:${n.loc.start.line}: scattered Chinese ${n.value}`);
 if(n.type==='JSXAttribute'&&['title','placeholder','aria-label','label'].includes(n.name?.name)&&n.value?.type==='StringLiteral'&&/[A-Za-z]{2,}/.test(n.value.value))errors.push(`${file}:${n.loc.start.line}: raw attribute ${n.name.name}`);
 if(n.type==='ObjectProperty'&&['name','description'].includes(n.key?.name)&&n.value?.type==='StringLiteral'&&/[A-Za-z]{3,}/.test(n.value.value))errors.push(`${file}:${n.loc.start.line}: untranslated data ${n.value.value}`);
 for(const [k,v]of Object.entries(n))if(!['loc','start','end','comments','leadingComments','trailingComments','innerComments','extra'].includes(k)){if(Array.isArray(v))v.forEach(x=>visit(x,n));else if(v&&typeof v==='object')visit(v,n)}
 }visit(ast,null)}
const experiments=JSON.parse(fs.readFileSync(path.join(dir,'locales/experiments.zh-CN.json'),'utf8'));if(experiments.length!==10||new Set(experiments.map(e=>e.id)).size!==10)errors.push('Expected exactly ten chemistry experiments');
for(const e of experiments){for(const c of e.controls){if(!dict[c.label])errors.push(`missing ${c.label}`);for(const [,key]of c.options||[])if(!dict[key])errors.push(`missing ${key}`)}}
const coverage=JSON.parse(fs.readFileSync(path.join(root,'frontend/public/chemistry-lab/fonts/coverage.json'),'utf8'));const codepoints=new Set(coverage.codepoints);for(const char of JSON.stringify(dict)+JSON.stringify(experiments))if(/[\p{Script=Han}]/u.test(char)&&!codepoints.has(char.codePointAt(0)))errors.push(`本地字体缺字：${char}`);
if(errors.length){console.error(errors.join('\n'));process.exitCode=1}else console.log(`zh-CN：${files.length} 个源码文件、${Object.keys(dict).length} 个字典项、${calls} 个静态翻译调用与10项课件资源检查通过。`);
