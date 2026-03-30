const boardEl = document.getElementById("board");
const movesEl = document.getElementById("moves");
const startBtn = document.getElementById("startBtn");
const voiceSelect = document.getElementById("voiceSelect");
const handsContainer = document.getElementById("senteHandsDisplay");
const autoDelayInput = document.getElementById("autoDelay");
const mateFilterSelect = document.getElementById("mateFilter");

let boardPieces = [];
let moves = [];
let currentMoveIndex = 0;
let kifList = [];
let voices = [];
let senteHands = "なし";
let goteHands = {};
let senteHandsMap = {};
let currentSide = "sente";
let lastMoveTo = null;
let lastPlayedFileName = null;

// ==============================
// 読み替えテーブル
// ==============================
const pieceYomi = {
  "歩":"ふ","香":"きょう","桂":"けい","銀":"ぎん","金":"きん",
  "角":"かく","飛":"ひしゃ","玉":"ぎょく","王":"ぎょく",
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
  boardEl.innerHTML = "";
  for(let i=0;i<81;i++){
    const sq = document.createElement("div");
    sq.className = "square";
    boardEl.appendChild(sq);
  }
}

// ==============================
async function loadIndex(){
  const res = await fetch(`index.json?v=${Date.now()}`, { cache:"no-store" });
  const data = await res.json();

  kifList = Array.isArray(data.files) ? data.files : [];

  setupMateFilterOptions();
}

// ==============================
function setupMateFilterOptions(){
  if(!mateFilterSelect) return;

  mateFilterSelect.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "すべて";
  mateFilterSelect.appendChild(allOption);

  const uniqueMoves = [...new Set(
    kifList
      .map(item => Number(item.moves))
      .filter(n => Number.isInteger(n) && n > 0)
  )].sort((a, b) => a - b);

  uniqueMoves.forEach(moves => {
    const option = document.createElement("option");
    option.value = String(moves);
    option.textContent = `${moves}手詰み`;
    mateFilterSelect.appendChild(option);
  });
}

// ==============================
async function loadRandomKif(){
  if(kifList.length === 0) return;

  const selectedMate = mateFilterSelect ? mateFilterSelect.value : "all";

  const filteredList = selectedMate === "all"
    ? kifList
    : kifList.filter(item => Number(item.moves) === Number(selectedMate));

  if(filteredList.length === 0){
    movesEl.innerHTML = "条件に合う詰将棋がありません";
    return;
  }

  // 直前に再生したファイルを除外
  let candidateList = filteredList.filter(item => item.name !== lastPlayedFileName);

  // 候補がなくなる場合は除外しない（1件しかない条件など）
  if(candidateList.length === 0){
    candidateList = filteredList;
  }

  const selected = candidateList[Math.floor(Math.random() * candidateList.length)];
  const fileName = selected.name;
  lastPlayedFileName = fileName;

  const res = await fetch(`kif/${fileName}?v=${Date.now()}`, { cache:"no-store" });
  const buffer = await res.arrayBuffer();
  const text = new TextDecoder("shift_jis").decode(buffer).replace(/^\uFEFF/, '');

  boardPieces = [];
  moves = [];
  currentMoveIndex = 0;
  currentSide = "sente";
  lastMoveTo = null;
  senteHands = "なし";
  senteHandsMap = {};
  goteHands = {};

  parseBoard(text);
  parseHands(text);
  parseKIF(text);
  initHandsArea();

  await startAutoPlay();
}

// ==============================
function parseBoard(text){
  const lines = text.split(/\r?\n/).filter(l => l.startsWith("|"));

  for(let y=0;y<9;y++){
    let row = lines[y]
      .replace(/\|/g, "")
      .replace(/[一二三四五六七八九]/g, "")
      .replace(/\s/g, "");

    const cells = row.match(/v?[歩香桂銀金角飛玉王と杏圭全龍馬]|・/g);
    if(!cells) continue;

    for(let i=0;i<9;i++){
      const cell = cells[i];
      if(cell === "・") continue;

      boardPieces.push({
        file: 9 - i, // 右端が1、左端が9
        rank: y + 1,
        piece: cell.replace("v",""),
        side: cell.startsWith("v") ? "gote" : "sente"
      });
    }
  }

  drawPieces();
}

// ==============================
// 盤面読み上げ
// ==============================
async function readBoard(){
  await speak("ばんめんをよみあげます");

  const gotePieces = boardPieces
    .filter(p => p.side === "gote")
    .sort((a,b) => a.rank - b.rank || a.file - b.file);

  const sentePieces = boardPieces
    .filter(p => p.side === "sente")
    .sort((a,b) => a.rank - b.rank || a.file - b.file);

  await speak("ぎょくかたのこま");
  for(const p of gotePieces){
    await speak(formatBoardYomi(p));
  }

  await speak("せめかたのこま");
  for(const p of sentePieces){
    await speak(formatBoardYomi(p));
  }
}

// ==============================
// 読みフォーマット
// ==============================
function formatBoardYomi(p){
  const fileFull = "１２３４５６７８９"[p.file - 1];
  const file = numberYomi[fileFull];
  const rankKanji = "一二三四五六七八九"[p.rank - 1];
  const rank = rankYomi[rankKanji];
  const piece = pieceYomi[p.piece];
  return `${file}${rank} ${piece}`;
}

// ==============================
function handsTextToMap(handsText){
  const map = {};
  if(!handsText || handsText === "なし") return map;

  const kanjiToNumber = {
    "一":1,"二":2,"三":3,"四":4,"五":5,
    "六":6,"七":7,"八":8,"九":9
  };

  const parts = handsText.split(/\s+/).filter(Boolean);
  parts.forEach(part => {
    const match = part.match(/^([歩香桂銀金角飛玉王])([一二三四五六七八九])?$/);
    if(!match) return;

    const piece = match[1];
    const count = match[2] ? (kanjiToNumber[match[2]] || 1) : 1;
    map[piece] = (map[piece] || 0) + count;
  });

  return map;
}

// ==============================
function parseHands(text){
  const lines = text.split(/\r?\n/);

  const senteLine = lines.find(l => l.includes("先手の持駒"));
  const goteLine = lines.find(l => l.includes("後手の持駒"));

  senteHands = senteLine ? (senteLine.split("：")[1] || "").trim() || "なし" : "なし";
  const goteHandsText = goteLine ? (goteLine.split("：")[1] || "").trim() || "なし" : "なし";

  senteHandsMap = handsTextToMap(senteHands);
  goteHands = handsTextToMap(goteHandsText);
}

// ==============================
function promotePiece(piece){
  const promoteMap = {
    "歩":"と",
    "香":"杏",
    "桂":"圭",
    "銀":"全",
    "角":"馬",
    "飛":"龍"
  };
  return promoteMap[piece] || piece;
}

// ==============================
function basePiece(piece){
  const baseMap = {
    "と":"歩",
    "杏":"香",
    "圭":"桂",
    "全":"銀",
    "馬":"角",
    "龍":"飛"
  };
  return baseMap[piece] || piece;
}

// ==============================
function addHandPiece(side, piece){
  const base = basePiece(piece);
  if(base === "玉" || base === "王") return;

  const targetMap = side === "sente" ? senteHandsMap : goteHands;
  targetMap[base] = (targetMap[base] || 0) + 1;

  if(side === "sente"){
    renderSenteHands();
  }
}

// ==============================
function removeHandPiece(side, piece){
  const base = basePiece(piece);
  const targetMap = side === "sente" ? senteHandsMap : goteHands;

  if(!targetMap[base]) return false;

  targetMap[base]--;
  if(targetMap[base] <= 0){
    delete targetMap[base];
  }

  if(side === "sente"){
    renderSenteHands();
  }

  return true;
}

// ==============================
function parseMove(moveData){
  const rawText = typeof moveData === "string" ? moveData : moveData.text;
  const fromFile = typeof moveData === "string" ? null : moveData.fromFile;
  const fromRank = typeof moveData === "string" ? null : moveData.fromRank;

  const trimmed = rawText.trim();

  if(trimmed === "詰み"){
    return { type: "end", raw: rawText };
  }

  const compact = trimmed.replace(/\s+/g, "");
  const isSame = compact.startsWith("同");
  const isDrop = compact.includes("打");
  const isPromote = compact.includes("成");

  let file = null;
  let rank = null;
  let piece = null;

  if(isSame){
    if(!lastMoveTo) return null;

    file = lastMoveTo.file;
    rank = lastMoveTo.rank;

    const m = compact.match(/^同([玉王飛角金銀桂香歩と杏圭全龍馬])/);
    if(!m) return null;
    piece = m[1];
  } else {
    const m = compact.match(/^([１２３４５６７８９])([一二三四五六七八九])([玉王飛角金銀桂香歩と杏圭全龍馬])/);
    if(!m) return null;

    file = "１２３４５６７８９".indexOf(m[1]) + 1;
    rank = "一二三四五六七八九".indexOf(m[2]) + 1;
    piece = m[3];
  }

  return {
    type: "move",
    raw: rawText,
    file,
    rank,
    piece,
    isSame,
    isDrop,
    isPromote,
    fromFile,
    fromRank
  };
}

// ==============================
function isPathClear(fromFile, fromRank, toFile, toRank){
  const stepFile = Math.sign(toFile - fromFile);
  const stepRank = Math.sign(toRank - fromRank);

  let f = fromFile + stepFile;
  let r = fromRank + stepRank;

  while(f !== toFile || r !== toRank){
    const blocker = boardPieces.find(p => p.file === f && p.rank === r);
    if(blocker) return false;
    f += stepFile;
    r += stepRank;
  }

  return true;
}

// ==============================
function canMoveTo(pieceObj, toFile, toRank){
  const df = toFile - pieceObj.file;
  const dr = toRank - pieceObj.rank;

  // 先手は前進=-1、後手は前進=+1 になるよう正規化
  const forward = pieceObj.side === "sente" ? -1 : 1;
  const rdf = df;
  const rdr = dr * forward;

  const p = pieceObj.piece;

  switch(p){
    case "歩":
      return rdf === 0 && rdr === 1;

    case "香":
      if(rdf !== 0 || rdr <= 0) return false;
      return isPathClear(pieceObj.file, pieceObj.rank, toFile, toRank);

    case "桂":
      return Math.abs(rdf) === 1 && rdr === 2;

    case "銀":
      return (
        (Math.abs(rdf) === 1 && rdr === 1) ||
        (Math.abs(rdf) === 1 && rdr === -1) ||
        (rdf === 0 && rdr === 1)
      );

    case "金":
    case "と":
    case "杏":
    case "圭":
    case "全":
      return (
        (rdf === 0 && rdr === 1) ||
        (Math.abs(rdf) === 1 && rdr === 1) ||
        (Math.abs(rdf) === 1 && rdr === 0) ||
        (rdf === 0 && rdr === -1)
      );

    case "角":
      if(Math.abs(df) !== Math.abs(dr) || df === 0) return false;
      return isPathClear(pieceObj.file, pieceObj.rank, toFile, toRank);

    case "飛":
      if(df !== 0 && dr !== 0) return false;
      if(df === 0 && dr === 0) return false;
      return isPathClear(pieceObj.file, pieceObj.rank, toFile, toRank);

    case "馬":
      if(Math.abs(df) === Math.abs(dr) && df !== 0){
        return isPathClear(pieceObj.file, pieceObj.rank, toFile, toRank);
      }
      return (Math.abs(df) + Math.abs(dr) === 1);

    case "龍":
      if((df === 0 || dr === 0) && !(df === 0 && dr === 0)){
        return isPathClear(pieceObj.file, pieceObj.rank, toFile, toRank);
      }
      return (Math.abs(df) === 1 && Math.abs(dr) === 1);

    case "玉":
    case "王":
      return Math.abs(df) <= 1 && Math.abs(dr) <= 1 && !(df === 0 && dr === 0);

    default:
      return false;
  }
}

// ==============================
function findSourcePiece(moveInfo, side){
  const targetPiece = basePiece(moveInfo.piece);

  const candidates = boardPieces.filter(p =>
    p.side === side &&
    basePiece(p.piece) === targetPiece &&
    canMoveTo(p, moveInfo.file, moveInfo.rank)
  );

  if(candidates.length === 0) return null;
  if(candidates.length === 1) return candidates[0];

  candidates.sort((a, b) => {
    const da = Math.abs(a.file - moveInfo.file) + Math.abs(a.rank - moveInfo.rank);
    const db = Math.abs(b.file - moveInfo.file) + Math.abs(b.rank - moveInfo.rank);
    return da - db;
  });

  return candidates[0];
}

// ==============================
function parseKIF(text){
  moves = [];

  const lines = text.split(/\r?\n/);
  for(const line of lines){
    const match = line.match(/^\s*\d+\s+(.+?)\s+\(/);
    if(!match) continue;

    let moveText = match[1].trim();
    if(!moveText) continue;

    const fromMatch = moveText.match(/\((\d)(\d)\)$/);

    let fromFile = null;
    let fromRank = null;

    if(fromMatch){
      fromFile = Number(fromMatch[1]);
      fromRank = Number(fromMatch[2]);
      moveText = moveText.replace(/\(\d{2}\)$/g, "").trim();
    }

    moves.push({
      text: moveText,
      fromFile,
      fromRank
    });

    if(moveText === "詰み"){
      break;
    }
  }
}

// ==============================
function drawPieces(){
  const squares = document.querySelectorAll(".square");

  squares.forEach(s => {
    s.className = "square";
    s.removeAttribute("data-piece");
  });

  boardPieces.forEach(p => {
    const idx = (p.rank - 1) * 9 + (9 - p.file);
    const sq = squares[idx];
    if(!sq) return;

    sq.classList.add("hasPiece");
    sq.dataset.piece = p.piece;

    if(p.side === "gote") sq.classList.add("gote");
    if(["と","杏","圭","全","龍","馬"].includes(p.piece)){
      sq.classList.add("promoted");
    }
  });
}

// ==============================
function renderSenteHands(){
  handsContainer.innerHTML = "";

  const order = ["飛","角","金","銀","桂","香","歩"];
  const displayArr = [];

  for(const piece of order){
    const count = senteHandsMap[piece] || 0;
    if(count > 0){
      displayArr.push(piece + "×" + count);
    }
  }

  handsContainer.innerHTML = displayArr.join("<br>");
}

// ==============================
function initHandsArea(){
  renderSenteHands();
}

// ==============================
function convertMoveToYomi(move){
  let r = move;
  for(const k in numberYomi) r = r.replaceAll(k, numberYomi[k]);
  for(const k in pieceYomi) r = r.replaceAll(k, pieceYomi[k]);
  return r.replaceAll("同","どう").replaceAll("成","なり").replaceAll("打","うち");
}

// ==============================
function convertHandsToYomi(handsText){
  if(!handsText || handsText === "なし") return "なし";

  const parts = handsText.split(/\s+/).filter(Boolean);

  const result = parts.map(part => {
    const match = part.match(/^([歩香桂銀金角飛玉王と杏圭全龍馬])([一二三四五六七八九])?$/);
    if(!match) return part;

    const piece = pieceYomi[match[1]] || match[1];
    const count = match[2] ? (rankYomi[match[2]] || match[2]) : "いち";

    return `${piece} ${count}まい`;
  });

  return result.join("、");
}

// ==============================
function loadVoices(){
  voices = speechSynthesis.getVoices();
  voiceSelect.innerHTML = "";

  voices.forEach((v, i) => {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = v.name;
    voiceSelect.appendChild(o);
  });
}
speechSynthesis.onvoiceschanged = loadVoices;

// ==============================
function wait(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==============================
async function waitAndLoadNextPuzzle(){
  const delaySec = Number(autoDelayInput.value) || 0;
  await wait(delaySec * 1000);
  await loadRandomKif();
}

// ==============================
function speak(text){
  return new Promise(res => {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voices[voiceSelect.value];
    u.onend = res;
    speechSynthesis.speak(u);
  });
}

// ==============================
async function startAutoPlay(){
  movesEl.innerHTML = "";

  await readBoard();
  await speak("せめかたのもちごまは " + convertHandsToYomi(senteHands));

  const delaySec = Number(autoDelayInput.value) || 0;
  await wait(delaySec * 1000);

  if(moves.length === 0){
    movesEl.innerHTML = "手順を取得できませんでした";
    return;
  }

  await playMoves();
}

// ==============================
async function playMoves(){
  if(currentMoveIndex >= moves.length){
    await waitAndLoadNextPuzzle();
    return;
  }

  const moveData = moves[currentMoveIndex];
  await speak(convertMoveToYomi(moveData.text));

  const div = document.createElement("div");
  div.textContent = moveData.text;
  movesEl.appendChild(div);

  applyMove(moveData);
  currentMoveIndex++;

  await playMoves();
}

// ==============================
function applyMove(moveData){
  const info = parseMove(moveData);
  if(!info) return;

  if(info.type === "end"){
    return;
  }

  const side = currentSide;
  const enemySide = side === "sente" ? "gote" : "sente";

  // 着手先の相手駒を取る
  const capturedIndex = boardPieces.findIndex(p =>
    p.file === info.file &&
    p.rank === info.rank &&
    p.side === enemySide
  );

  if(capturedIndex >= 0){
    const capturedPiece = boardPieces[capturedIndex];
    boardPieces.splice(capturedIndex, 1);
    addHandPiece(side, capturedPiece.piece);
  }

  if(info.isDrop){
    const removed = removeHandPiece(side, info.piece);
    if(!removed){
      console.warn(`${side} の持ち駒に ${info.piece} がありません`);
      return;
    }

    boardPieces.push({
      file: info.file,
      rank: info.rank,
      piece: basePiece(info.piece),
      side: side
    });
  } else {
    let source = null;

    // KIFの (31) などがある場合は、その位置の駒を直接使う
    if(info.fromFile && info.fromRank){
      source = boardPieces.find(p =>
        p.file === info.fromFile &&
        p.rank === info.fromRank &&
        p.side === side
      );
    }

    // 元位置が無い場合だけ従来の候補探索を使う
    if(!source){
      source = findSourcePiece(info, side);
    }

    if(!source){
      console.warn(`移動元が見つかりません: ${info.raw}`);
      return;
    }

    source.file = info.file;
    source.rank = info.rank;

    if(info.isPromote){
      source.piece = promotePiece(source.piece);
    }
  }

  lastMoveTo = { file: info.file, rank: info.rank };
  currentSide = enemySide;

  drawPieces();
}

// ==============================
startBtn.onclick = loadRandomKif;

// ==============================
function resetGame(){
  lastPlayedFileName = null;
  location.reload();
}
