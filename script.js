const boardEl = document.getElementById("board");
const movesEl = document.getElementById("moves");
const startBtn = document.getElementById("startBtn");
const voiceSelect = document.getElementById("voiceSelect");

let boardPieces = [];
let moves = [];
let currentMoveIndex = 0;
let kifList = [];
let currentKif = "";
let voices = [];
let senteHands = "なし";


// ==============================
// 読み替えテーブル
// ==============================
const pieceYomi = {
  "歩":"ふ",
  "香":"きょう",
  "桂":"けい",
  "銀":"ぎん",
  "金":"きん",
  "角":"かく",
  "飛":"ひしゃ",
  "玉":"ぎょく",
  "王":"ぎょく",
  "と":"と",
  "杏":"なりきょう",
  "圭":"なりけい",
  "全":"なりぎん",
  "龍":"りゅう",
  "馬":"うま"
};

const numberYomi = {
  "１":"いち",
  "２":"にー",
  "３":"さん",
  "４":"よん",
  "５":"ごー",
  "６":"ろく",
  "７":"なな",
  "８":"はち",
  "９":"きゅう"
};


// ==============================
// 初期化
// ==============================
initBoard();
loadVoices();
loadIndex();


// ==============================
// ボード生成
// ==============================
function initBoard(){
  boardEl.innerHTML = "";
  for(let i=0;i<81;i++){
    const sq = document.createElement("div");
    sq.className = "square";
    boardEl.appendChild(sq);
  }
}


// ==============================
// index.json 読み込み
// ==============================
async function loadIndex(){
  try{
    const res = await fetch(`index.json?v=${Date.now()}`, {cache:"no-store"});
    const data = await res.json();
    kifList = data.files;
  }catch(e){
    console.error("index.json読み込み失敗", e);
  }
}


// ==============================
// KIF読み込み
// ==============================
async function loadRandomKif(){

  if(kifList.length === 0) return;

  const r = Math.floor(Math.random() * kifList.length);
  const file = kifList[r];

  currentKif = file;

  const res = await fetch(`kif/${file}?v=${Date.now()}`, {cache:"no-store"});
  const buffer = await res.arrayBuffer();

  const decoder = new TextDecoder("shift_jis");
  const text = decoder.decode(buffer).replace(/^\uFEFF/, '');

  boardPieces = [];
  moves = [];
  currentMoveIndex = 0;

  parseBoard(text);
  parseHands(text);
  parseKIF(text);

  await startAutoPlay();
}


// ==============================
// 盤面解析
// ==============================
function parseBoard(text){

  const lines = text.split(/\r?\n/);
  const boardLines = [];

  for(let line of lines){
    if(line.startsWith("|")){
      boardLines.push(line);
    }
  }

  if(boardLines.length < 9){
    console.error("盤面不足");
    return;
  }

  for(let y=0;y<9;y++){

    let row = boardLines[y];

    row = row.replace(/\|/g,"");
    row = row.replace(/[一二三四五六七八九]/g,"");
    row = row.replace(/\s/g,"");

    const cells = row.match(/v?[歩香桂銀金角飛玉王と杏圭全龍馬]|・/g);

    if(!cells || cells.length !== 9){
      console.warn("解析失敗:", row);
      continue;
    }

    for(let x=0;x<9;x++){

      const cell = cells[x];
      if(cell === "・") continue;

      const file = 9 - x;
      const rank = y + 1;

      if(cell.startsWith("v")){
        boardPieces.push({file, rank, piece:cell.slice(1), side:"gote"});
      }else{
        boardPieces.push({file, rank, piece:cell, side:"sente"});
      }
    }
  }

  drawPieces();
}


// ==============================
// ★盤面読み上げ（新規追加）
// ==============================
async function readBoard(){

  // 並び替え（玉方→攻め方、上→下、右→左）
  const sorted = [...boardPieces].sort((a,b)=>{

    if(a.side !== b.side){
      return a.side === "gote" ? -1 : 1;
    }

    if(a.rank !== b.rank){
      return a.rank - b.rank;
    }

    return b.file - a.file;
  });

  for(const p of sorted){

    const file = numberYomi[String(p.file).replace(/[0-9]/g, d=>"０１２３４５６７８９"[d])] || "";
    const rankKanji = "一二三四五六七八九"[p.rank - 1];
    const rank = convertMoveToYomi(rankKanji);

    const piece = pieceYomi[p.piece];

    await speak(file + rank + " " + piece);
  }
}


// ==============================
// 持ち駒解析
// ==============================
function parseHands(text){

  const lines = text.split(/\r?\n/);
  let found = false;

  for(let line of lines){

    if(line.includes("先手の持駒")){

      found = true;

      let hand = line.split("：")[1];

      if(!hand || hand.trim() === ""){
        senteHands = "なし";
        return;
      }

      hand = hand.replace(/\u3000/g, " ").trim();

      senteHands = hand === "なし" ? "なし" : hand;
      return;
    }
  }

  if(!found){
    senteHands = "なし";
  }
}


// ==============================
// 棋譜解析
// ==============================
function parseKIF(text){

  const lines = text.split(/\r?\n/);

  for(let line of lines){

    if(/^\d+/.test(line)){
      const parts = line.trim().split(/\s+/);
      if(parts.length >= 2){
        moves.push(parts[1]);
      }
    }
  }
}


// ==============================
// 駒描画
// ==============================
function drawPieces(){

  const squares = document.querySelectorAll(".square");

  squares.forEach(sq=>{
    sq.className = "square";
    sq.removeAttribute("data-piece");
  });

  boardPieces.forEach(p=>{

    const x = 9 - p.file;
    const y = p.rank - 1;
    const index = y * 9 + x;

    const sq = squares[index];

    sq.classList.add("hasPiece");
    sq.dataset.piece = p.piece;

    if(p.side === "gote"){
      sq.classList.add("gote");
    }

    if(["と","杏","圭","全","龍","馬"].includes(p.piece)){
      sq.classList.add("promoted");
    }
  });
}


// ==============================
// 読み変換
// ==============================
function convertMoveToYomi(move){

  let result = move;

  for(const key in numberYomi){
    result = result.replaceAll(key, numberYomi[key]);
  }

  for(const key in pieceYomi){
    result = result.replaceAll(key, pieceYomi[key]);
  }

  result = result.replaceAll("同", "どう");
  result = result.replaceAll("成", "なり");
  result = result.replaceAll("打", "うち");

  return result;
}


// ==============================
// 音声
// ==============================
function loadVoices(){
  voices = speechSynthesis.getVoices();
  voiceSelect.innerHTML = "";

  voices.forEach((v,i)=>{
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = v.name;
    voiceSelect.appendChild(opt);
  });
}

speechSynthesis.onvoiceschanged = loadVoices;

function speak(text){
  return new Promise(resolve=>{
    const uttr = new SpeechSynthesisUtterance(text);
    uttr.voice = voices[voiceSelect.value];
    uttr.onend = ()=> resolve();
    speechSynthesis.speak(uttr);
  });
}


// ==============================
// 自動再生
// ==============================
async function startAutoPlay(){

  movesEl.innerHTML = "";

  await speak("せめかたのもちごまは " + senteHands);

  await readBoard(); // ★ここ追加

  await playMoves();
}


async function playMoves(){

  if(currentMoveIndex >= moves.length) return;

  const move = moves[currentMoveIndex];
  const yomi = convertMoveToYomi(move);

  await speak(yomi);

  const div = document.createElement("div");
  div.textContent = move;
  movesEl.appendChild(div);

  applyMove(move);

  currentMoveIndex++;

  await playMoves();
}


// ==============================
// 駒移動
// ==============================
function applyMove(move){

  if(move.startsWith("同")){
    return;
  }

  const file = move.charAt(0);
  const rank = move.charAt(1);

  const targetFile = "１２３４５６７８９".indexOf(file) + 1;
  const targetRank = "一二三四五六七八九".indexOf(rank) + 1;

  if(targetFile <= 0 || targetRank <= 0) return;

  const piece = boardPieces.find(p=>p.side==="sente");

  if(piece){
    piece.file = targetFile;
    piece.rank = targetRank;
  }

  drawPieces();
}


// ==============================
// ボタン
// ==============================
startBtn.onclick = async ()=>{
  await loadRandomKif();
};

function resetMoves(){
  location.reload();
}