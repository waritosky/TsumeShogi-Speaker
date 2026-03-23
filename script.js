const boardEl = document.getElementById("board");
const movesEl = document.getElementById("moves");
const startBtn = document.getElementById("startBtn");
const voiceSelect = document.getElementById("voiceSelect");

let boardPieces = [];
let moves = [];
let currentMoveIndex = 0;
let kifList = [];
let voices = [];
let senteHands = "なし";


// ==============================
// 読み替えテーブル
// ==============================
const pieceYomi = {
  "歩":"ふ","香":"きょう","桂":"けい","銀":"ぎん","金":"きん",
  "角":"かく","飛":"ひ","玉":"ぎょく","王":"ぎょく",
  "と":"と","杏":"なりきょう","圭":"なりけい",
  "全":"なりぎん","龍":"りゅう","馬":"うま"
};

const numberYomi = {
  "１":"いち","２":"にー","３":"さん","４":"よん",
  "５":"ごー","６":"ろく","７":"なな","８":"はち","９":"きゅう"
};

const rankYomi = {
  "一":"いち","二":"に","三":"さん","四":"よん",
  "五":"ご","六":"ろく","七":"なな","八":"はち","九":"きゅう"
};


// ==============================
initBoard();
loadVoices();
loadIndex();


// ==============================
function initBoard(){
  boardEl.innerHTML="";
  for(let i=0;i<81;i++){
    const sq=document.createElement("div");
    sq.className="square";
    boardEl.appendChild(sq);
  }
}


// ==============================
async function loadIndex(){
  const res=await fetch(`index.json?v=${Date.now()}`,{cache:"no-store"});
  const data=await res.json();
  kifList=data.files;
}


// ==============================
async function loadRandomKif(){

  if(kifList.length===0) return;

  const file=kifList[Math.floor(Math.random()*kifList.length)];

  const res=await fetch(`kif/${file}?v=${Date.now()}`,{cache:"no-store"});
  const buffer=await res.arrayBuffer();

  const text=new TextDecoder("shift_jis")
    .decode(buffer)
    .replace(/^\uFEFF/,'');

  boardPieces=[];
  moves=[];
  currentMoveIndex=0;

  parseBoard(text);
  parseHands(text);
  parseKIF(text);

  await startAutoPlay();
}


// ==============================
function parseBoard(text){

  const lines=text.split(/\r?\n/).filter(l=>l.startsWith("|"));

  for(let y=0;y<9;y++){

    let row=lines[y]
      .replace(/\|/g,"")
      .replace(/[一二三四五六七八九]/g,"")
      .replace(/\s/g,"");

    const cells=row.match(/v?[歩香桂銀金角飛玉王と杏圭全龍馬]|・/g);

    for(let x=0;x<9;x++){

      const cell=cells[x];
      if(cell==="・") continue;

      boardPieces.push({
        file:9-x, // 右→左
        rank:y+1,
        piece:cell.replace("v",""),
        side:cell.startsWith("v")?"gote":"sente"
      });
    }
  }

  drawPieces();
}


// ==============================
// ★盤面読み上げ（修正済）
// ==============================
async function readBoard(){

  await speak("ばんめんをよみあげます");

  await speak("ぎょくかたのこま");

  for(let rank=1;rank<=9;rank++){
    for(let file=1;file<=9;file++){ // ★ここ修正

      const p=boardPieces.find(
        x=>x.rank===rank && x.file===file && x.side==="gote"
      );

      if(p) await speak(formatBoardYomi(p));
    }
  }

  await speak("せめかたのこま");

  for(let rank=1;rank<=9;rank++){
    for(let file=1;file<=9;file++){ // ★ここ修正

      const p=boardPieces.find(
        x=>x.rank===rank && x.file===file && x.side==="sente"
      );

      if(p) await speak(formatBoardYomi(p));
    }
  }
}


// ==============================
// 読みフォーマット
// ==============================
function formatBoardYomi(p){

  const fileFull="１２３４５６７８９"[p.file-1];
  const file=numberYomi[fileFull];

  const rankKanji="一二三四五六七八九"[p.rank-1];
  const rank=rankYomi[rankKanji];

  const piece=pieceYomi[p.piece];

  return `${file}${rank} ${piece}`;
}


// ==============================
function parseHands(text){
  const line=text.split(/\r?\n/).find(l=>l.includes("先手の持駒"));
  senteHands=line? (line.split("：")[1]||"").trim()||"なし":"なし";
}


// ==============================
function parseKIF(text){
  text.split(/\r?\n/).forEach(l=>{
    if(/^\d+/.test(l)){
      const m=l.trim().split(/\s+/)[1];
      if(m) moves.push(m);
    }
  });
}


// ==============================
function drawPieces(){

  const squares=document.querySelectorAll(".square");

  squares.forEach(s=>{
    s.className="square";
    s.removeAttribute("data-piece");
  });

  boardPieces.forEach(p=>{
    const idx=(p.rank-1)*9+(9-p.file);
    const sq=squares[idx];

    sq.classList.add("hasPiece");
    sq.dataset.piece=p.piece;

    if(p.side==="gote") sq.classList.add("gote");
    if(["と","杏","圭","全","龍","馬"].includes(p.piece)){
      sq.classList.add("promoted");
    }
  });
}


// ==============================
function convertMoveToYomi(move){

  let r=move;

  for(const k in numberYomi) r=r.replaceAll(k,numberYomi[k]);
  for(const k in pieceYomi) r=r.replaceAll(k,pieceYomi[k]);

  return r
    .replaceAll("同","どう")
    .replaceAll("成","なり")
    .replaceAll("打","うち");
}


// ==============================
function loadVoices(){
  voices=speechSynthesis.getVoices();
  voiceSelect.innerHTML="";
  voices.forEach((v,i)=>{
    const o=document.createElement("option");
    o.value=i;
    o.textContent=v.name;
    voiceSelect.appendChild(o);
  });
}
speechSynthesis.onvoiceschanged=loadVoices;

function speak(text){
  return new Promise(res=>{
    const u=new SpeechSynthesisUtterance(text);
    u.voice=voices[voiceSelect.value];
    u.onend=res;
    speechSynthesis.speak(u);
  });
}


// ==============================
async function startAutoPlay(){

  movesEl.innerHTML="";

  await readBoard();

  await speak("せめかたのもちごまは "+senteHands);

  await playMoves();
}


// ==============================
async function playMoves(){

  if(currentMoveIndex>=moves.length) return;

  const move=moves[currentMoveIndex];

  await speak(convertMoveToYomi(move));

  const div=document.createElement("div");
  div.textContent=move;
  movesEl.appendChild(div);

  applyMove(move);

  currentMoveIndex++;

  await playMoves();
}


// ==============================
function applyMove(move){

  if(move.startsWith("同")) return;

  const file="１２３４５６７８９".indexOf(move[0])+1;
  const rank="一二三四五六七八九".indexOf(move[1])+1;

  const piece=boardPieces.find(p=>p.side==="sente");

  if(piece){
    piece.file=file;
    piece.rank=rank;
  }

  drawPieces();
}


// ==============================
startBtn.onclick=loadRandomKif;

function resetMoves(){
  location.reload();
}