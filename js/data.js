// ============================================================
// data.js — Load and cache JSON data files
// ============================================================

const _cache = {};

async function fetchJSON(path) {
  if (_cache[path]) return _cache[path];
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  const data = await res.json();
  _cache[path] = data;
  return data;
}

export async function loadAllData() {
  const [equipment, exercises, routineTemplates] = await Promise.all([
    fetchJSON('data/equipment.json'),
    fetchJSON('data/exercises.json'),
    fetchJSON('data/routineTemplates.json')
  ]);
  return { equipment, exercises, routineTemplates };
}
