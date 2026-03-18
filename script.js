let moves = [];
let index = 0;
let boardPieces = [];

let voices = [];
let selectedVoice = null;
let speechQueue = [];
let speaking = false;

let kifList = [];
let currentKif = null;

let audioUnlocked = false;

const voiceSelect = document.getElementById("voiceSelect");
const movesDiv = document.getElementById("moves");
const boardElement = document.getElementById("board");

let boardMatrix = [];
let lastMove = null;

/* =========================
   盤面生成
========================= */

function createBoard(){
  boardElement.innerHTML="";
  boardMatrix=[];

  for(let y=1;y<=9;y++){
    let row=[];
    for(let x=9;x>=1;x--){
      const square=document.createElement("div");
      square.className="square";
      boardElement.appendChild(square);
      row.push(square);
    }
    boardMatrix.push(row);
  }
}

createBoard();

/* =========================
   音声
========================= */

function loadVoices(){
  voices = speechSynthesis.getVoices();

  voiceSelect.innerHTML="";

  voices
    .filter(v => v.lang.startsWith("ja"))
    .forEach(v=>{
      const option=document.createElement("option");
      option.value=v.name;
      option.textContent=v.name;
      voiceSelect.appendChild(option);
    });

  if(voices.length>0){
    selectedVoice = voices[0];
  }
}

speechSynthesis.onvoiceschanged = loadVoices;

voiceSelect.addEventListener("change",()=>{
  const name = voiceSelect.value;
  selectedVoice = voices.find(v=>v.name===name);
});

/* =========================
   音声キュー
========================= */

function speak(text){
  speechQueue.push(text);
  if(!speaking){
    playNext();
  }
}

function playNext(){
  if(speechQueue.length===0){
    speaking=false;
    return;
  }

  speaking=true;

  const text=speechQueue.shift();

  const uttr=new SpeechSynthesisUtterance(text);
  uttr.lang="ja-JP";

  if(selectedVoice){
    uttr.voice=selectedVoice;
  }

  uttr.rate=1.0;
  uttr.pitch=1.2;

  uttr.onend=playNext;

  speechSynthesis.speak(uttr);
}

/* =========================
   index.json
========================= */

async function loadKifList(){
  const res = await fetch("index.json?v="+Date.now());
  const data = await res.json();
  kifList = data.files;
}

/* =========================
   ランダムKIF
========================= */

async function loadRandomKif(){

  if(kifList.length===0) return;

  const file = kifList[Math.floor(Math.random()*kifList.length)];
  currentKif = file;

  const res = await fetch("kif/"+file+"?v="+Date.now());
  const text = await res.text();

  resetGame();

  parseBoard(text);
  parseKIF(text);

  startAutoPlay();
}

/* =========================
   リセット
========================= */

function resetGame(){
  moves=[];
  index=0;
  boardPieces=[];
  lastMove=null;

  speechQueue=[];
  speaking=false;

  movesDiv.innerHTML="";
  createBoard();
}

/* =========================
   盤面解析
========================= */

function parseBoard(text){

  const lines=text.split(/\r?\n/);
  const boardLines=[];

  for(let line of lines){
    if(line.startsWith("|")){
      boardLines.push(line);
    }
  }

  for(let y=0;y<9;y++){

    let row=boardLines[y];

    row=row.replace(/\|/g,"");
    row=row.replace(/[一二三四五六七八九]/g,"");

    const cells=row.match(/v?[歩香桂銀金角飛玉王と杏圭全龍馬]|・/g);

    for(let x=0;x<9;x++){

      const cell=cells[x];
      if(cell==="・") continue;

      const file=9-x;
      const rank=y+1;

      if(cell.startsWith("v")){
        boardPieces.push({
          file,rank,
          piece:cell.substring(1),
          side:"gote"
        });
      }else{
        boardPieces.push({
          file,rank,
          piece:cell,
          side:"sente"
        });
      }
    }
  }

  drawPieces();
}

/* =========================
   描画
========================= */

function drawPieces(){

  boardMatrix.forEach(row=>{
    row.forEach(cell=>{
      cell.classList.remove("gote","promoted","hasPiece");
      cell.dataset.piece="";
    });
  });

  boardPieces.forEach(p=>{

    const x = 9 - p.file;
    const y = p.rank - 1;

    const square = boardMatrix[y][x];

    square.dataset.piece = p.piece;
    square.classList.add("hasPiece");

    if(p.side==="gote"){
      square.classList.add("gote");
    }

    if(["と","杏","圭","全","馬","龍"].includes(p.piece)){
      square.classList.add("promoted");
    }
  });
}

/* =========================
   棋譜解析
========================= */

function parseKIF(text){

  moves=[];
  index=0;

  const lines=text.split(/\r?\n/);

  for(let line of lines){

    line=line.trim();

    const match=line.match(/^\d+\s+([^\(]+)/);

    if(match){
      let move=match[1];
      move=move.replace(/[ 　]/g,"");
      moves.push(move);
    }
  }

  movesDiv.innerHTML="";
}

/* =========================
   読み上げ変換
========================= */

const numRead={
  "1":"いち","2":"に","3":"さん","4":"よん","5":"ご",
  "6":"ろく","7":"なな","8":"はち","9":"きゅう",
  "一":"いち","二":"に","三":"さん","四":"よん",
  "五":"ご","六":"ろく","七":"なな","八":"はち","九":"きゅう"
};

const pieceRead={
  "歩":"ふ","香":"きょう","桂":"けい","銀":"ぎん","金":"きん",
  "角":"かく","飛":"ひしゃ","玉":"ぎょく","王":"ぎょく",
  "と":"と","杏":"なりきょう","圭":"なりけい","全":"なりぎん",
  "龍":"りゅう","馬":"うま"
};

function convertMove(move){

  if(move.startsWith("同")){
    return "どう"+(pieceRead[move.match(/[歩香桂銀金角飛玉王と杏圭全龍馬]/)]||"");
  }

  const m=move.match(/([1-9])([一二三四五六七八九])/);

  let t="";

  if(m){
    t += numRead[m[1]];
    t += numRead[m[2]];
  }

  const p=move.match(/[歩香桂銀金角飛玉王と杏圭全龍馬]/);

  if(p){
    t += pieceRead[p[0]];
  }

  if(move.includes("成")) t+="なる";
  if(move.includes("打")) t+="うつ";

  return t;
}

/* =========================
   手順表示
========================= */

function appendMove(num,move){
  const div=document.createElement("div");
  div.textContent=num+" "+move;
  movesDiv.appendChild(div);
}

/* =========================
   自動再生
========================= */

function startAutoPlay(){

  function loop(){

    if(index>=moves.length){

      const delay = Number(document.getElementById("autoDelay").value)||10;

      setTimeout(()=>{
        loadRandomKif();
      },delay*1000);

      return;
    }

    const move=moves[index];

    speak(convertMove(move));
    appendMove(index+1,move);

    index++;

    setTimeout(loop,2000);
  }

  loop();
}

/* =========================
   開始ボタン
========================= */

document.getElementById("startBtn").addEventListener("click", async ()=>{

  if(!audioUnlocked){
    const uttr=new SpeechSynthesisUtterance(" ");
    speechSynthesis.speak(uttr);
    audioUnlocked=true;
  }

  await loadKifList();
  loadRandomKif();
});