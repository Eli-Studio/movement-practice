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

function checkDesignTokens() {
  const tokenSource = readFileSync(join(root, 'home-os-tokens.css'), 'utf8');
  const movementSource = readFileSync(join(root, 'styles.css'), 'utf8');
  const indexSource = readFileSync(join(root, 'index.html'), 'utf8');
  const workerSource = readFileSync(join(root, 'service-worker.js'), 'utf8');
  const rootBlock = tokenSource.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1];
  const dayBlock = tokenSource.match(/html\[data-theme="day"\]\s*\{([\s\S]*?)\n\}/)?.[1];
  assert(rootBlock && dayBlock, 'Home OS token file must define :root and Day theme blocks');

  const readProperties = block => Object.fromEntries(
    [...block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)]
      .map(([, name, value]) => [name, value.trim()])
  );
  const rootTokens = readProperties(rootBlock);
  const themes = {
    night: rootTokens,
    day: { ...rootTokens, ...readProperties(dayBlock) }
  };
  const required = [
    '--home-os-surface-shell', '--home-os-surface-panel',
    '--home-os-surface-control', '--home-os-surface-document',
    '--home-os-text-on-shell-primary', '--home-os-text-on-shell-secondary',
    '--home-os-text-on-shell-subtle', '--home-os-text-on-document',
    '--home-os-text-on-document-muted', '--home-os-orientation',
    '--home-os-focus', '--home-os-radius-sm', '--home-os-space-4',
    '--home-os-touch-target-min', '--home-os-font-display',
    '--home-os-motion-practical', '--home-os-motion-ritual'
  ];
  for (const name of required) assert(rootTokens[name], `Missing shared token ${name}`);

  const resolve = (name, tokens, seen = new Set()) => {
    assert(!seen.has(name), `Circular token reference at ${name}`);
    seen.add(name);
    const value = tokens[name];
    assert(value, `Token ${name} has no value`);
    const reference = value.match(/^var\((--[a-z0-9-]+)\)$/)?.[1];
    return reference ? resolve(reference, tokens, seen) : value;
  };
  const rgb = value => {
    const hex = value.match(/^#([0-9a-f]{6})$/i)?.[1];
    assert(hex, `Contrast token must resolve to a six-digit hex color, got ${value}`);
    return [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  };
  const luminance = values => values
    .map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (foreground, background, tokens) => {
    const a = luminance(rgb(resolve(foreground, tokens)));
    const b = luminance(rgb(resolve(background, tokens)));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const pairs = [
    ['--home-os-text-on-shell-primary', '--home-os-surface-shell'],
    ['--home-os-text-on-shell-secondary', '--home-os-surface-panel'],
    ['--home-os-text-on-shell-subtle', '--home-os-surface-panel'],
    ['--home-os-text-on-document', '--home-os-surface-document'],
    ['--home-os-text-on-document-muted', '--home-os-surface-document'],
    ['--home-os-orientation', '--home-os-surface-shell'],
    ['--home-os-orientation', '--home-os-surface-panel']
  ];
  for (const [theme, tokens] of Object.entries(themes)) {
    for (const [foreground, background] of pairs) {
      const ratio = contrast(foreground, background, tokens);
      assert(ratio >= 4.5,
        `${theme} ${foreground} on ${background} is ${ratio.toFixed(2)}:1; expected WCAG AA`);
    }
  }

  const tokenLink = 'home-os-tokens.css?v=0.1.0-candidate.1';
  assert(indexSource.indexOf(tokenLink) < indexSource.indexOf('styles.css?v='),
    'Home OS tokens must load before Movement component styles');
  assert(workerSource.includes(`'./${tokenLink}'`), 'Service worker must cache Home OS tokens');
  for (const alias of [
    '--movement-surface-app: var(--home-os-surface-shell)',
    '--movement-text-primary: var(--home-os-text-on-shell-primary)',
    '--movement-brass-500: var(--home-os-orientation)',
    '--movement-focus: var(--home-os-focus)'
  ]) assert(movementSource.includes(alias), `Missing Movement compatibility alias: ${alias}`);

  console.log(`✓ Home OS token contract (${resolve('--home-os-token-version', rootTokens).replaceAll('"', '')}, Night + Day AA roles)`);
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
checkDesignTokens();
await checkMigration();
await checkCSV();
console.log('\nRelease checks passed.');
