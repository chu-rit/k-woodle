const inputContainer = document.querySelector('.inputs');
const lengthOptions = [...document.querySelectorAll('.length-option')];
const results = document.querySelector('#results');
const status = document.querySelector('#status');
const clearButton = document.querySelector('#clear');
const excludeParts = document.querySelector('#exclude-parts');

const INITIALS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const VOWELS = ['ㅏ', 'ㅏㅣ', 'ㅑ', 'ㅑㅣ', 'ㅓ', 'ㅓㅣ', 'ㅕ', 'ㅕㅣ', 'ㅗ', 'ㅗㅏ', 'ㅗㅏㅣ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅓㅣ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ'];
const FINALS = ['', 'ㄱ', 'ㄱㄱ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅅㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const VALID_JAMO = new Set([...INITIALS, ...VOWELS.flatMap((vowel) => [...vowel]), ...FINALS.flatMap((final) => [...final])]);

let activeLength = 5;
let inputs = [];
let states = [];
let activeInputIndex = null;
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
    const initialJamo = INITIALS[initial];
    decomposed.push(...({ 'ㄲ': 'ㄱㄱ', 'ㄸ': 'ㄷㄷ', 'ㅃ': 'ㅂㅂ', 'ㅆ': 'ㅅㅅ', 'ㅉ': 'ㅈㅈ' }[initialJamo] || initialJamo));
    decomposed.push(...VOWELS[vowel]);
    decomposed.push(...FINALS[final]);
  }
  return decomposed;
}

function render() {
  const conditions = inputs.map((input) => input.value);
  const hasConditions = conditions.some(Boolean);
  const availableWords = words.map((word) => ({ word, decomposed: decomposeWord(word) })).filter(({ word, decomposed }) => {
    if (excludeParts.checked && excludedWords.has(word)) return false;
    return decomposed.length === activeLength;
  });
  const matches = availableWords.filter(({ decomposed }) => {
    if (!hasConditions && new Set(decomposed).size !== decomposed.length) return false;
    return conditions.every((condition, index) => {
      if (!condition) return true;
      if (states[index] === 'green') return decomposed[index] === condition;
      return decomposed[index] !== condition && decomposed.some((jamo, jamoIndex) => jamoIndex !== index && jamo === condition);
    });
  });

  if (!hasConditions) {
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
    for (const word of matchesToShow) {
      const item = document.createElement('div');
      item.className = 'result';
      item.textContent = word;
      results.append(item);
    }
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
  input.classList.toggle('green', states[index] === 'green' && Boolean(input.value));
  input.setAttribute('aria-label', `${index + 1}번째 자모 ${states[index] === 'yellow' ? '노랑' : '초록'}`);
}

function bindInput(input, index) {
  input.addEventListener('focus', () => {
    setActiveInput(index);
    if (input.value) input.select();
  });
  input.addEventListener('input', () => {
    setActiveInput(index);
    const value = [...input.value].find((character) => VALID_JAMO.has(character));
    input.value = value || '';
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
    states[index] = states[index] === 'green' ? 'yellow' : 'green';
    updateState(index);
    render();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Backspace' && !input.value && index > 0) inputs[index - 1].focus();
  });
}

function applyJamoToActiveInput(character) {
  if (activeInputIndex === null) return;
  const input = inputs[activeInputIndex];
  input.value = character;
  const targetIndex = activeInputIndex;
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

function setLength(length) {
  activeLength = length;
  activeInputIndex = null;
  inputs = [];
  states = [];
  inputContainer.replaceChildren();
  inputContainer.style.setProperty('--length', length);
  lengthOptions.forEach((option) => option.classList.toggle('active', Number(option.dataset.length) === length));
  for (let index = 0; index < length; index += 1) {
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

excludeParts.addEventListener('change', render);

lengthOptions.forEach((option) => {
  option.addEventListener('click', () => {
    const length = Number(option.dataset.length);
    setLength(length);
    loadWords(length);
  });
});

clearButton.addEventListener('click', () => {
  inputs.forEach((input, index) => {
    input.value = '';
    states[index] = 'green';
    updateState(index);
  });
  inputs[0]?.focus();
  render();
});

fetch('./제외품사_단어목록.txt')
  .then((response) => {
    if (!response.ok) throw new Error('제외 품사 목록을 불러오지 못했습니다.');
    return response.text();
  })
  .then((text) => {
    excludedWords = new Set(text.split(/\r?\n/).map((word) => word.trim()).filter(Boolean));
    render();
  })
  .catch(() => {});

setLength(activeLength);
loadWords(activeLength);
