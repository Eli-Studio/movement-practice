import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const readJSON = relativePath => JSON.parse(readFileSync(join(root, relativePath), 'utf8'));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function checkSyntax() {
  const files = readdirSync(join(root, 'js'))
    .filter(name => name.endsWith('.js') && name !== 'vendor')
    .map(name => join(root, 'js', name));
  files.push(join(root, 'service-worker.js'));
  for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  console.log(`✓ JavaScript syntax (${files.length} files)`);
}

function checkDataGraph() {
  const equipment = readJSON('data/equipment.json');
  const exercises = readJSON('data/exercises.json');
  const routines = readJSON('data/routineTemplates.json');
  const equipmentIds = new Set(equipment.map(item => item.id));
  const exerciseIds = new Set(exercises.map(item => item.id));
  const routineIds = new Set(routines.map(item => item.id));

  assert(equipmentIds.size === equipment.length, 'Duplicate equipment id');
  assert(exerciseIds.size === exercises.length, 'Duplicate exercise id');
  assert(routineIds.size === routines.length, 'Duplicate routine id');

  for (const exercise of exercises) {
    assert(Array.isArray(exercise.eligibleUsers) && exercise.eligibleUsers.length > 0,
      `Exercise ${exercise.id} has no eligible profile`);
    assert(exercise.eligibleUsers.every(id => id === 'userA' || id === 'userB'),
      `Exercise ${exercise.id} has an invalid profile id`);
    if (exercise.eligibleUsers.length === 1) {
      const expectedPrefix = exercise.eligibleUsers[0] === 'userA' ? 'strength_' : 'adaptive_';
      assert(exercise.id.startsWith(expectedPrefix),
        `Profile-specific exercise ${exercise.id} must use ${expectedPrefix}`);
    }
    for (const id of exercise.equipment ?? []) {
      assert(equipmentIds.has(id), `Exercise ${exercise.id} references missing equipment ${id}`);
    }
    for (const id of exercise.substitutions ?? []) {
      assert(exerciseIds.has(id), `Exercise ${exercise.id} references missing substitution ${id}`);
    }
  }

  for (const routine of routines) {
    assert(routine.id.startsWith('strength_') || routine.id.startsWith('adaptive_'),
      `Routine ${routine.id} must use a neutral namespace`);
    for (const slot of routine.slots ?? []) {
      assert(Array.isArray(slot.allowedExerciseIds) && slot.allowedExerciseIds.length > 0,
        `Routine ${routine.id} contains an empty exercise pool`);
      for (const id of slot.allowedExerciseIds) {
        assert(exerciseIds.has(id), `Routine ${routine.id} references missing exercise ${id}`);
      }
    }
  }

  for (const icon of readJSON('manifest.json').icons ?? []) {
    assert(existsSync(join(root, icon.src)), `Manifest references missing icon ${icon.src}`);
  }
  console.log(`✓ Data graph (${exercises.length} exercises, ${routines.length} routines, ${equipment.length} equipment records)`);
}

async function checkMigration() {
  const { getDefaultState, importStateJSON } = await import('../js/storage.js');
  const defaultState = getDefaultState();
  const packageVersion = readJSON('package.json').version;
  const configSource = readFileSync(join(root, 'js', 'config.js'), 'utf8');
  const appVersion = configSource.match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1];
  assert(appVersion === packageVersion && defaultState.version === packageVersion,
    'Package, displayed app, and persisted schema versions must match');

  const legacyState = JSON.stringify(defaultState)
    .replaceAll('strength_', 'legacyA_')
    .replaceAll('adaptive_', 'legacyB_')
    .replaceAll('userA', 'legacyA')
    .replaceAll('userB', 'legacyB');
  const result = importStateJSON(legacyState);
  assert(result.success, `Legacy backup migration failed: ${result.error ?? 'unknown error'}`);
  const migrated = JSON.stringify(result.state);
  assert(!migrated.includes('legacyA') && !migrated.includes('legacyB'),
    'Legacy namespace remained after migration');
  assert(migrated.includes('strength_upper_push') && migrated.includes('adaptive_gentle_upper'),
    'Canonical routine ids missing after migration');
  console.log(`✓ Version alignment and structural legacy-backup migration (${packageVersion})`);
}

async function checkCSV() {
  const { escapeCSVCell } = await import('../js/exports.js');
  const unsafe = ['=1+1', '+SUM(A1:A2)', '-2+3', '@command', '  =trimmed', '\t+tabbed'];
  for (const value of unsafe) {
    const cell = escapeCSVCell(value);
    assert(cell.startsWith('"\''), `CSV formula prefix was not neutralized: ${JSON.stringify(value)}`);
  }
  assert(escapeCSVCell('Text "quoted"') === '"Text ""quoted"""', 'CSV quotes were not escaped');
  console.log('✓ Spreadsheet-safe CSV cells');
}

checkSyntax();
checkDataGraph();
await checkMigration();
await checkCSV();
console.log('\nRelease checks passed.');
