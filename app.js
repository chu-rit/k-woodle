const modes = {
  helper: {
    history: document.querySelector('#helper-history'),
    inputsContainer: document.querySelector('#helper-inputs'),
    status: document.querySelector('#helper-status'),
    submit: document.querySelector('#helper-submit'),
    clear: document.querySelector('#helper-clear'),
    historyRows: [], inputs: [], states: [], activeInputIndex: null,
  },
  game: {
    history: document.querySelector('#game-history'),
    inputsContainer: document.querySelector('#game-inputs'),
    status: document.querySelector('#game-status'),
    submit: document.querySelector('#game-submit'),
    clear: document.querySelector('#game-clear'),
    historyRows: [], inputs: [], states: [], activeInputIndex: null,
    targetWord: null, attempts: 0, over: false, message: '',
  },
};
const helperPanel = document.querySelector('#helper-panel');
const gamePanel = document.querySelector('#game-panel');
const gameModeToggle = document.querySelector('#game-mode');
const lengthOptions = [...document.querySelectorAll('.length-option')];
const resultsTitle = document.querySelector('#results-title');
const results = document.querySelector('#results');
const excludeParts = document.querySelector('#exclude-parts');
const adblockWarning = document.querySelector('#adblock-warning');
const adblockRetry = document.querySelector('#adblock-retry');

const INITIALS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const VOWELS = ['ㅏ', 'ㅏㅣ', 'ㅑ', 'ㅑㅣ', 'ㅓ', 'ㅓㅣ', 'ㅕ', 'ㅕㅣ', 'ㅗ', 'ㅗㅏ', 'ㅗㅏㅣ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅓㅣ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ'];
const FINALS = ['', 'ㄱ', 'ㄱㄱ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅅㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const VALID_JAMO = new Set([...INITIALS, ...VOWELS.flatMap((vowel) => [...vowel]), ...FINALS.flatMap((final) => [...final])]);
const INITIAL_EXPANSION = { 'ㄲ': 'ㄱㄱ', 'ㄸ': 'ㄷㄷ', 'ㅃ': 'ㅂㅂ', 'ㅆ': 'ㅅㅅ', 'ㅉ': 'ㅈㅈ' };

let activeMode = 'helper';
let activeLength = 5;
let words = [];
let excludedWords = new Set();
let excludedLoaded = false;
let loadId = 0;

function stateOf(mode = activeMode) { return modes[mode]; }
function decomposeWord(word) {
  const result = [];
  for (const character of word) {
    const syllable = character.charCodeAt(0) - 0xac00;
    if (syllable < 0 || syllable > 11171) return [];
    const initial = Math.floor(syllable / 588);
    const vowel = Math.floor((syllable % 588) / 28);
    result.push(...(INITIAL_EXPANSION[INITIALS[initial]] || INITIALS[initial]), ...VOWELS[vowel], ...FINALS[syllable % 28]);
  }
  return result;
}

function rowMatches(decomposed, row) {
  const required = new Map();
  const gray = new Set();
  for (const [index, condition] of row.values.entries()) {
    if (!condition) continue;
    const state = row.states[index];
    if (state === 'green' && decomposed[index] !== condition) return false;
    if (state === 'yellow' && decomposed[index] === condition) return false;
    if (state === 'gray') gray.add(condition);
    else required.set(condition, (required.get(condition) || 0) + 1);
  }
  for (const [jamo, count] of required) if (decomposed.filter((value) => value === jamo).length < count) return false;
  for (const jamo of gray) if (decomposed.filter((value) => value === jamo).length > (required.get(jamo) || 0)) return false;
  return true;
}

function renderHistory(mode) {
  const state = stateOf(mode);
  state.history.replaceChildren();
  state.history.style.setProperty('--length', activeLength);
  state.historyRows.forEach((row) => {
    const item = document.createElement('div');
    item.className = 'history-row';
    row.values.forEach((value, index) => {
      const cell = document.createElement('div');
      cell.className = `history-cell ${row.states[index]}`;
      cell.textContent = value;
      cell.setAttribute('aria-label', `${index + 1}번째 자모 ${row.states[index]}`);
      if (mode === 'helper') {
        cell.addEventListener('click', () => {
          row.states[index] = { gray: 'yellow', yellow: 'green', green: 'gray' }[row.states[index]];
          render();
        });
      }
      item.append(cell);
    });
    state.history.append(item);
  });
}

function render() {
  renderHistory(activeMode);
  const state = stateOf();
  if (activeMode === 'game') {
    resultsTitle.hidden = true;
    results.replaceChildren();
    state.clear.textContent = state.over ? '새 게임' : '포기하기';
    state.status.textContent = state.message || `${state.attempts} / 6회 시도`;
    return;
  }
  resultsTitle.hidden = false;
  const conditions = state.inputs.map((input) => input.value);
  const hasConditions = conditions.some(Boolean);
  const availableWords = words.map((word) => ({ word, decomposed: decomposeWord(word) })).filter(({ word, decomposed }) => {
    if (excludeParts.checked && excludedWords.has(word)) return false;
    return decomposed.length === activeLength;
  });
  const matches = availableWords.filter(({ decomposed }) => {
    if (state.historyRows.some((row) => !rowMatches(decomposed, row))) return false;
    if (!hasConditions && state.historyRows.length === 0 && new Set(decomposed).size !== decomposed.length) return false;
    return !hasConditions || rowMatches(decomposed, { values: conditions, states: state.states });
  });
  if (!hasConditions && state.historyRows.length === 0) {
    const frequency = new Map();
    availableWords.forEach(({ decomposed }) => new Set(decomposed).forEach((jamo) => frequency.set(jamo, (frequency.get(jamo) || 0) + 1)));
    matches.sort((a, b) => {
      const score = (entry) => [...new Set(entry.decomposed)].reduce((total, jamo) => total + frequency.get(jamo), 0);
      return score(b) - score(a) || a.word.localeCompare(b.word);
    });
  }
  const shown = matches.slice(0, 10).map(({ word }) => word);
  results.replaceChildren();
  if (!shown.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = words.length ? '조건에 맞는 단어가 없습니다.' : '단어 목록을 불러오는 중...';
    results.append(empty);
  } else shown.forEach((word) => {
    const item = document.createElement('button');
    item.type = 'button'; item.className = 'result'; item.textContent = word;
    item.title = '클릭해서 현재 입력칸에 채우기';
    item.addEventListener('click', () => fillCurrent(word));
    results.append(item);
  });
  state.status.textContent = words.length ? `${shown.length}개 표시 (최대 10개)` : '단어 목록을 불러오는 중...';
}

function setActiveInput(mode, index) {
  const state = stateOf(mode);
  state.activeInputIndex = index;
  state.inputs.forEach((input, inputIndex) => input.classList.toggle('selected', inputIndex === index));
}
function updateState(mode, index) {
  const state = stateOf(mode); const input = state.inputs[index];
  input.classList.toggle('yellow', state.states[index] === 'yellow');
  input.classList.toggle('gray', state.states[index] === 'gray');
  input.classList.toggle('green', state.states[index] === 'green' && Boolean(input.value));
}
function bindInput(mode, input, index) {
  input.addEventListener('focus', () => { setActiveInput(mode, index); if (input.value) input.select(); });
  input.addEventListener('input', () => {
    const state = stateOf(mode); setActiveInput(mode, index);
    input.value = [...input.value].find((character) => VALID_JAMO.has(character)) || '';
    state.states[index] = mode === 'game' ? 'green' : 'gray';
    if (mode === 'game') input.classList.remove('green', 'yellow', 'gray'); else updateState(mode, index);
    render();
    if (input.value && index < state.inputs.length - 1) { state.inputs[index + 1].focus(); setActiveInput(mode, index + 1); }
  });
  input.addEventListener('click', () => {
    const state = stateOf(mode);
    setActiveInput(mode, index);
    if (mode === 'game' || !input.value) return;
    input.select(); state.states[index] = { gray: 'yellow', yellow: 'green', green: 'gray' }[state.states[index]];
    updateState(mode, index); render();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); submitCurrent(mode); }
    else if (event.key === 'Backspace' && !input.value && index > 0) stateOf(mode).inputs[index - 1].focus();
  });
}
function buildInputs(mode) {
  const state = stateOf(mode); state.inputs = []; state.states = []; state.activeInputIndex = null; state.inputsContainer.replaceChildren();
  state.inputsContainer.style.setProperty('--length', activeLength);
  for (let index = 0; index < activeLength; index += 1) {
    const input = document.createElement('input'); input.className = 'jamo-input'; input.maxLength = 1; input.inputMode = 'text'; input.autocomplete = 'off'; input.setAttribute('aria-label', `${index + 1}번째 자모`);
    state.inputs.push(input); state.states.push(mode === 'game' ? 'green' : 'gray'); state.inputsContainer.append(input); bindInput(mode, input, index);
  }
}
function getGameCandidates() {
  if (!excludedLoaded) return [];
  return words.filter((word) => !excludedWords.has(word));
}
function chooseTarget() {
  const state = modes.game;
  if (state.targetWord || state.over) return;
  const candidates = getGameCandidates().filter((word) => decomposeWord(word).length === activeLength);
  state.targetWord = candidates[Math.floor(Math.random() * candidates.length)] || null;
}
function getFeedback(guess, target) {
  const feedback = Array(guess.length).fill('gray');
  const usedTarget = Array(target.length).fill(false);

  guess.forEach((jamo, index) => {
    if (jamo === target[index]) {
      feedback[index] = 'green';
      usedTarget[index] = true;
    }
  });
  guess.forEach((jamo, index) => {
    if (feedback[index] === 'green') return;
    const targetIndex = target.findIndex((targetJamo, index) => !usedTarget[index] && targetJamo === jamo);
    if (targetIndex !== -1) {
      feedback[index] = 'yellow';
      usedTarget[targetIndex] = true;
    }
  });
  return feedback;
}
function showGameSuccessMessage() {
  const state = modes.game;
  state.inputs.forEach((input) => { input.disabled = true; });
  [...'정답입니다'].forEach((character, index) => {
    if (!state.inputs[index]) return;
    state.inputs[index].value = character;
    state.inputs[index].disabled = true;
    state.inputs[index].classList.add('green');
  });
}

function submitGameGuess(values) {
  const state = modes.game; if (!state.targetWord || state.over) return;
  const feedback = getFeedback(values, decomposeWord(state.targetWord)); state.historyRows.push({ values: [...values], states: feedback }); state.attempts += 1; buildInputs('game');
  if (feedback.every((value) => value === 'green')) { state.over = true; state.message = `정답입니다! ${state.attempts}번 만에 맞혔습니다.`; showGameSuccessMessage(); }
  else if (state.attempts >= 6) { state.over = true; state.message = `게임 종료! 정답은 ${state.targetWord}입니다.`; }
  if (!state.over) state.inputs[0]?.focus(); render();
}
function submitCurrent(mode) {
  const state = stateOf(mode); const values = state.inputs.map((input) => input.value);
  if (values.some((value) => !value)) { state.status.textContent = '모든 자모를 입력한 뒤 제출하세요.'; return; }
  if (mode === 'game') submitGameGuess(values); else { state.historyRows.push({ values, states: [...state.states] }); buildInputs('helper'); state.inputs[0]?.focus(); render(); }
}
function fillCurrent(word) {
  const state = modes.helper; const values = decomposeWord(word); if (values.length !== activeLength) return;
  values.forEach((value, index) => { state.inputs[index].value = value; state.states[index] = 'gray'; updateState('helper', index); });
  setActiveInput('helper', 0); state.inputs[0]?.focus(); render();
}
function startNewGame() {
  const state = modes.game;
  state.historyRows = [];
  state.attempts = 0;
  state.over = false;
  state.message = '';
  state.targetWord = null;
  chooseTarget();
  buildInputs('game');
  state.inputs[0]?.focus();
  render();
}

function surrenderGame() {
  const state = modes.game;
  if (!state.targetWord) return;
  const answer = state.targetWord;
  state.over = true;
  state.message = `포기했습니다. 정답은 ${answer}입니다.`;
  state.targetWord = null;
  buildInputs('game');
  render();
}

function setMode(game) {
  activeMode = game ? 'game' : 'helper';
  helperPanel.hidden = game;
  gamePanel.hidden = !game;
  if (game && !modes.game.targetWord && !modes.game.over) chooseTarget();
  render();
}
async function loadWords(length) {
  const currentLoad = ++loadId; words = []; render();
  try { const response = await fetch(`./${length}자모_단어목록.txt`); if (!response.ok) throw new Error(); const text = await response.text(); if (currentLoad !== loadId) return; words = text.split(/\r?\n/).map((word) => word.trim()).filter(Boolean); if (activeMode === 'game' && !modes.game.targetWord && !modes.game.over) chooseTarget(); render(); }
  catch { if (currentLoad !== loadId) return; stateOf().status.textContent = '단어 목록을 불러오지 못했습니다.'; }
}
function setLength(length) { activeLength = length; modes.helper.historyRows = []; modes.game.historyRows = []; modes.game.attempts = 0; modes.game.over = false; modes.game.message = ''; modes.game.targetWord = null; buildInputs('helper'); buildInputs('game'); lengthOptions.forEach((option) => option.classList.toggle('active', Number(option.dataset.length) === length)); loadWords(length); }

document.addEventListener('keydown', (event) => { const state = stateOf(); const index = state.activeInputIndex; if (index === null || event.key.length !== 1 || !VALID_JAMO.has(event.key) || event.target === state.inputs[index]) return; event.preventDefault(); state.inputs[index].value = event.key; state.states[index] = activeMode === 'game' ? 'green' : 'gray'; if (activeMode === 'game') state.inputs[index].classList.remove('green', 'yellow', 'gray'); else updateState(activeMode, index); render(); if (index < state.inputs.length - 1) { state.inputs[index + 1].focus(); setActiveInput(activeMode, index + 1); } }, true);
document.addEventListener('beforeinput', (event) => { const state = stateOf(); const index = state.activeInputIndex; if (index === null || event.inputType !== 'insertText' || !VALID_JAMO.has(event.data || '') || event.target === state.inputs[index]) return; event.preventDefault(); state.inputs[index].value = event.data; state.states[index] = activeMode === 'game' ? 'green' : 'gray'; if (activeMode === 'game') state.inputs[index].classList.remove('green', 'yellow', 'gray'); else updateState(activeMode, index); render(); if (index < state.inputs.length - 1) { state.inputs[index + 1].focus(); setActiveInput(activeMode, index + 1); } }, true);
excludeParts.addEventListener('change', () => { if (activeMode === 'game') { modes.game.historyRows = []; modes.game.attempts = 0; modes.game.over = false; modes.game.message = ''; modes.game.targetWord = null; chooseTarget(); buildInputs('game'); } render(); });
gameModeToggle.addEventListener('change', () => setMode(gameModeToggle.checked));
lengthOptions.forEach((option) => option.addEventListener('click', () => setLength(Number(option.dataset.length))));
Object.values(modes).forEach((state) => {
  const mode = state === modes.game ? 'game' : 'helper';
  state.submit.addEventListener('click', () => submitCurrent(mode));
  state.clear.addEventListener('click', () => {
    if (mode === 'game') {
      if (state.over) startNewGame(); else surrenderGame();
      return;
    }
    state.historyRows = [];
    buildInputs('helper');
    state.inputs[0]?.focus();
    render();
  });
});
function checkAdBlock() { const ad = document.querySelector('.kakao_ad_area'); adblockWarning.classList.toggle('visible', !ad || getComputedStyle(ad).display === 'none' || ad.offsetHeight === 0); }
adblockRetry.addEventListener('click', () => window.location.reload()); window.setTimeout(checkAdBlock, 4000);
buildInputs('helper'); buildInputs('game'); loadWords(activeLength);
fetch('./제외품사_단어목록.txt').then((response) => response.ok ? response.text() : Promise.reject()).then((text) => {
  excludedWords = new Set(text.split(/\r?\n/).map((word) => word.trim()).filter(Boolean));
  excludedLoaded = true;
  if (activeMode === 'game' && !modes.game.targetWord && !modes.game.over) chooseTarget();
  render();
}).catch(() => {});
