const inputContainer = document.querySelector('.inputs');
const historyContainer = document.querySelector('#history');
const lengthOptions = [...document.querySelectorAll('.length-option')];
const results = document.querySelector('#results');
const status = document.querySelector('#status');
const submitButton = document.querySelector('#submit');
const clearButton = document.querySelector('#clear');
const excludeParts = document.querySelector('#exclude-parts');
const adblockWarning = document.querySelector('#adblock-warning');
const adblockRetry = document.querySelector('#adblock-retry');

const INITIALS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const VOWELS = ['ㅏ', 'ㅏㅣ', 'ㅑ', 'ㅑㅣ', 'ㅓ', 'ㅓㅣ', 'ㅕ', 'ㅕㅣ', 'ㅗ', 'ㅗㅏ', 'ㅗㅏㅣ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅓㅣ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ'];
const FINALS = ['', 'ㄱ', 'ㄱㄱ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅅㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const VALID_JAMO = new Set([...INITIALS, ...VOWELS.flatMap((vowel) => [...vowel]), ...FINALS.flatMap((final) => [...final])]);
const INITIAL_EXPANSION = { 'ㄲ': 'ㄱㄱ', 'ㄸ': 'ㄷㄷ', 'ㅃ': 'ㅂㅂ', 'ㅆ': 'ㅅㅅ', 'ㅉ': 'ㅈㅈ' };

let activeLength = 5;
let inputs = [];
let states = [];
let activeInputIndex = null;
let historyRows = [];
let words = [];
let excludedWords = new Set();
let loadId = 0;

function decomposeWord(word) {
  const decomposed = [];
  for (const character of word) {
    const syllable = character.charCodeAt(0) - 0xac00;
    if (syllable < 0 || syllable > 11171) return [];
    const initial = Math.floor(syllable / 588);
    const vowel = Math.floor((syllable % 588) / 28);
    const final = syllable % 28;
    decomposed.push(...(INITIAL_EXPANSION[INITIALS[initial]] || INITIALS[initial]));
    decomposed.push(...VOWELS[vowel]);
    decomposed.push(...FINALS[final]);
  }
  return decomposed;
}

function rowMatches(decomposed, row) {
  const requiredCounts = new Map();
  const grayJamos = new Set();

  for (const [index, condition] of row.values.entries()) {
    if (!condition) continue;
    const state = row.states[index];
    if (state === 'green' && decomposed[index] !== condition) return false;
    if (state === 'yellow' && decomposed[index] === condition) return false;
    if (state === 'gray') {
      grayJamos.add(condition);
      continue;
    }
    requiredCounts.set(condition, (requiredCounts.get(condition) || 0) + 1);
  }

  for (const [jamo, requiredCount] of requiredCounts) {
    const actualCount = decomposed.filter((value) => value === jamo).length;
    if (actualCount < requiredCount) return false;
  }

  for (const jamo of grayJamos) {
    const actualCount = decomposed.filter((value) => value === jamo).length;
    if (actualCount > (requiredCounts.get(jamo) || 0)) return false;
  }

  return true;
}

function renderHistory() {
  historyContainer.replaceChildren();
  historyContainer.style.setProperty('--length', activeLength);
  historyRows.forEach((row) => {
    const item = document.createElement('div');
    item.className = 'history-row';
    row.values.forEach((value, index) => {
      const cell = document.createElement('div');
      cell.className = `history-cell ${row.states[index]}`;
      cell.textContent = value;
      const stateName = { green: '초록', yellow: '노랑', gray: '회색' }[row.states[index]];
      cell.setAttribute('aria-label', `${index + 1}번째 자모 ${stateName}`);
      cell.addEventListener('click', () => {
        row.states[index] = { green: 'yellow', yellow: 'gray', gray: 'green' }[row.states[index]];
        render();
      });
      item.append(cell);
    });
    historyContainer.append(item);
  });
}

function render() {
  renderHistory();
  const conditions = inputs.map((input) => input.value);
  const hasConditions = conditions.some(Boolean);
  const availableWords = words.map((word) => ({ word, decomposed: decomposeWord(word) })).filter(({ word, decomposed }) => {
    if (excludeParts.checked && excludedWords.has(word)) return false;
    return decomposed.length === activeLength;
  });
  const matches = availableWords.filter(({ decomposed }) => {
    if (historyRows.some((row) => !rowMatches(decomposed, row))) return false;
    if (!hasConditions && historyRows.length === 0 && new Set(decomposed).size !== decomposed.length) return false;
    return !hasConditions || rowMatches(decomposed, { values: conditions, states });
  });

  if (!hasConditions && historyRows.length === 0) {
    const frequency = new Map();
    availableWords.forEach(({ decomposed }) => new Set(decomposed).forEach((jamo) => frequency.set(jamo, (frequency.get(jamo) || 0) + 1)));
    matches.sort((a, b) => {
      const score = (entry) => [...new Set(entry.decomposed)].reduce((total, jamo) => total + frequency.get(jamo), 0);
      return score(b) - score(a) || a.word.localeCompare(b.word);
    });
  }

  const matchesToShow = matches.slice(0, 10).map(({ word }) => word);
  results.replaceChildren();
  if (!matchesToShow.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = words.length ? '조건에 맞는 단어가 없습니다.' : '단어 목록을 불러오는 중...';
    results.append(empty);
  } else {
    matchesToShow.forEach((word) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'result';
      item.textContent = word;
      item.title = '클릭해서 현재 입력칸에 채우기';
      item.addEventListener('click', () => fillCurrent(word));
      results.append(item);
    });
  }
  status.textContent = words.length ? `${matchesToShow.length}개 표시 (최대 10개)` : '단어 목록을 불러오는 중...';
}

function setActiveInput(index) {
  activeInputIndex = index;
  inputs.forEach((input, inputIndex) => input.classList.toggle('selected', inputIndex === index));
}

function updateState(index) {
  const input = inputs[index];
  input.classList.toggle('yellow', states[index] === 'yellow');
  input.classList.toggle('gray', states[index] === 'gray');
  input.classList.toggle('green', states[index] === 'green' && Boolean(input.value));
  const stateName = { green: '초록', yellow: '노랑', gray: '회색' }[states[index]];
  input.setAttribute('aria-label', `${index + 1}번째 자모 ${stateName}`);
}

function bindInput(input, index) {
  input.addEventListener('focus', () => {
    setActiveInput(index);
    if (input.value) input.select();
  });
  input.addEventListener('input', () => {
    setActiveInput(index);
    input.value = [...input.value].find((character) => VALID_JAMO.has(character)) || '';
    states[index] = 'green';
    updateState(index);
    render();
    if (input.value && index < inputs.length - 1) {
      inputs[index + 1].focus();
      setActiveInput(index + 1);
    }
  });
  input.addEventListener('click', () => {
    setActiveInput(index);
    if (!input.value) return;
    input.select();
    states[index] = { green: 'yellow', yellow: 'gray', gray: 'green' }[states[index]];
    updateState(index);
    render();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitCurrent();
    } else if (event.key === 'Backspace' && !input.value && index > 0) {
      inputs[index - 1].focus();
    }
  });
}

function applyJamoToActiveInput(character) {
  if (activeInputIndex === null) return;
  const targetIndex = activeInputIndex;
  inputs[targetIndex].value = character;
  states[targetIndex] = 'green';
  updateState(targetIndex);
  render();
  if (targetIndex < inputs.length - 1) {
    inputs[targetIndex + 1].focus();
    setActiveInput(targetIndex + 1);
  }
}

document.addEventListener('keydown', (event) => {
  if (activeInputIndex === null || event.key.length !== 1 || !VALID_JAMO.has(event.key)) return;
  if (event.target === inputs[activeInputIndex]) return;
  event.preventDefault();
  applyJamoToActiveInput(event.key);
}, true);

document.addEventListener('beforeinput', (event) => {
  if (activeInputIndex === null || event.inputType !== 'insertText' || !VALID_JAMO.has(event.data || '')) return;
  if (event.target === inputs[activeInputIndex]) return;
  event.preventDefault();
  applyJamoToActiveInput(event.data);
}, true);

function buildInputs() {
  inputs = [];
  states = [];
  activeInputIndex = null;
  inputContainer.replaceChildren();
  inputContainer.style.setProperty('--length', activeLength);
  for (let index = 0; index < activeLength; index += 1) {
    const input = document.createElement('input');
    input.className = 'jamo-input';
    input.maxLength = 1;
    input.inputMode = 'text';
    input.setAttribute('aria-label', `${index + 1}번째 자모`);
    input.autocomplete = 'off';
    inputs.push(input);
    states.push('green');
    inputContainer.append(input);
    bindInput(input, index);
  }
}

function setLength(length) {
  activeLength = length;
  historyRows = [];
  buildInputs();
  lengthOptions.forEach((option) => option.classList.toggle('active', Number(option.dataset.length) === length));
}

function addHistory(values, wordStates) {
  if (values.length !== activeLength) return;
  historyRows.push({ values, states: wordStates });
  buildInputs();
  inputs[0]?.focus();
  render();
}

function fillCurrent(word) {
  const values = decomposeWord(word);
  if (values.length !== activeLength) return;
  values.forEach((value, index) => {
    inputs[index].value = value;
    states[index] = 'green';
    updateState(index);
  });
  setActiveInput(0);
  inputs[0]?.focus();
  render();
}

function submitCurrent() {
  const values = inputs.map((input) => input.value);
  if (values.some((value) => !value)) {
    status.textContent = '모든 자모를 입력한 뒤 제출하세요.';
    return;
  }
  addHistory(values, [...states]);
}

async function loadWords(length) {
  const currentLoad = ++loadId;
  words = [];
  render();
  try {
    const response = await fetch(`./${length}자모_단어목록.txt`);
    if (!response.ok) throw new Error('단어 목록을 불러오지 못했습니다.');
    const text = await response.text();
    if (currentLoad !== loadId) return;
    words = text.split(/\r?\n/).map((word) => word.trim()).filter(Boolean);
    render();
  } catch {
    if (currentLoad !== loadId) return;
    status.textContent = '단어 목록을 불러오지 못했습니다.';
    results.innerHTML = '<div class="empty">선택한 자모 데이터 파일을 찾을 수 없습니다.</div>';
  }
}

function checkAdBlock() {
  const ad = document.querySelector('.kakao_ad_area');
  const blocked = !ad || getComputedStyle(ad).display === 'none' || ad.offsetHeight === 0;
  adblockWarning.classList.toggle('visible', blocked);
}

excludeParts.addEventListener('change', render);
adblockRetry.addEventListener('click', () => window.location.reload());
window.setTimeout(checkAdBlock, 4000);
submitButton.addEventListener('click', submitCurrent);
lengthOptions.forEach((option) => option.addEventListener('click', () => {
  const length = Number(option.dataset.length);
  setLength(length);
  loadWords(length);
}));
clearButton.addEventListener('click', () => {
  historyRows = [];
  buildInputs();
  inputs[0]?.focus();
  render();
});

fetch('./제외품사_단어목록.txt')
  .then((response) => response.ok ? response.text() : Promise.reject())
  .then((text) => {
    excludedWords = new Set(text.split(/\r?\n/).map((word) => word.trim()).filter(Boolean));
    render();
  })
  .catch(() => {});

buildInputs();
loadWords(activeLength);
