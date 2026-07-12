// ============================================================
// exports.js — JSON, CSV, and Markdown export
// ============================================================

import { today, formatDate } from './utils.js';
import { exportStateJSON } from './storage.js';

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportFullBackupJSON(state) {
  const filename = `morning-circuit-backup-${today()}.json`;
  downloadFile(filename, exportStateJSON(state), 'application/json');
  return filename;
}

export function exportMonthCSV(sessions, missedDays, year, month) {
  const pad   = n => String(n+1).padStart(2,'0');
  const fname = `morning-circuit-${year}-${pad(month)}.csv`;

  const mSessions = sessions.filter(s => {
    const d = new Date(s.date + 'T12:00:00');
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const mMissed = missedDays.filter(m => {
    const d = new Date(m.date + 'T12:00:00');
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const q = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
  const header = 'Date,Users,Type,EliRoutine,EliRoutineType,ChristinaRoutine,ChristinaAdaptation,Status,EliFatigue,EliJointPain,ChristinaPainDay,Meditation,Notes\n';

  let csv = header;

  for (const s of mSessions) {
    csv += [
      s.date, s.users.join('+'), s.sessionType,
      s.eliRoutineId ?? '', s.eliRoutineType ?? '',
      s.christinaRoutineId ?? '', s.christinaAdaptationLevel ?? '',
      s.status,
      s.eliEndCheckin?.formFatigue ?? '',
      s.eliEndCheckin?.jointPain   ?? '',
      s.christinaCheckin?.painDay  ?? '',
      s.meditation?.completed ? `${s.meditation.durationMinutes}min` : '',
      s.notes ?? ''
    ].map(q).join(',') + '\n';
  }

  for (const m of mMissed) {
    csv += [
      m.date, m.users?.join('+') ?? 'unknown', 'missed',
      '','','','', m.category,
      '','','','', m.notes ?? ''
    ].map(q).join(',') + '\n';
  }

  downloadFile(fname, csv, 'text/csv');
  return fname;
}

export function exportMonthMarkdown(sessions, missedDays, year, month) {
  const pad     = n => String(n+1).padStart(2,'0');
  const fname   = `morning-circuit-${year}-${pad(month)}.md`;
  const mName   = new Date(year, month, 1).toLocaleDateString('en-US',{ month:'long', year:'numeric' });

  const mSessions = sessions.filter(s => {
    const d = new Date(s.date + 'T12:00:00');
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const mMissed = missedDays.filter(m => {
    const d = new Date(m.date + 'T12:00:00');
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const eliCount = mSessions.filter(s => s.users.includes('eli')).length;
  const cCount   = mSessions.filter(s => s.users.includes('christina')).length;

  let md = `# Morning Circuit — ${mName}\n\n`;
  md    += `*Exported ${formatDate(today())}*\n\n---\n\n`;
  md    += `## Summary\n\n`;
  md    += `- Total sessions: ${mSessions.length}\n`;
  md    += `- Eli sessions: ${eliCount}\n`;
  md    += `- Christina sessions: ${cCount}\n`;
  md    += `- Missed / other days: ${mMissed.length}\n\n---\n\n`;
  md    += `## Session Log\n\n`;

  const all = [
    ...mSessions.map(s => ({ date: s.date, kind: 'session', data: s })),
    ...mMissed.map(m =>   ({ date: m.date, kind: 'missed',  data: m }))
  ].sort((a,b) => a.date.localeCompare(b.date));

  for (const entry of all) {
    if (entry.kind === 'session') {
      const s = entry.data;
      md += `### ${formatDate(s.date)}\n\n`;
      md += `**Users:** ${s.users.join(', ')}\n\n`;
      if (s.users.includes('eli')) {
        md += `**Eli:** ${s.eliRoutineId ?? 'No routine'} (${s.eliRoutineType ?? ''})\n`;
        if (s.eliEndCheckin) {
          md += `- Form fatigue: ${s.eliEndCheckin.formFatigue}/5\n`;
          md += `- Joint pain: ${s.eliEndCheckin.jointPain ?? 'not recorded'}\n`;
        }
      }
      if (s.users.includes('christina')) {
        md += `**Christina:** ${s.christinaRoutineId ?? 'No routine'} (${s.christinaAdaptationLevel ?? ''})\n`;
        if (s.christinaCheckin?.painDay) md += `- Pain day: ${s.christinaCheckin.painDay}\n`;
      }
      if (s.meditation?.completed) md += `**Meditation:** ${s.meditation.durationMinutes} minutes\n`;
      if (s.notes) md += `**Notes:** ${s.notes}\n`;
      md += '\n';
    } else {
      const m = entry.data;
      md += `### ${formatDate(m.date)}\n\n`;
      md += `**Logged as:** ${m.category.replace(/_/g,' ')}\n`;
      if (m.notes) md += `**Notes:** ${m.notes}\n`;
      md += '\n';
    }
  }

  downloadFile(fname, md, 'text/markdown');
  return fname;
}

export function exportCycleMarkdown(cycleState, sessions) {
  const fname = `morning-circuit-${cycleState.cycleId}.md`;

  const cycleSessions = sessions.filter(s =>
    s.date >= cycleState.startDate && s.date <= cycleState.endDate
  );

  const fatigue = cycleSessions.map(s => s.eliEndCheckin?.formFatigue).filter(Boolean);
  const avgF    = fatigue.length
    ? (fatigue.reduce((a,b) => a+b,0) / fatigue.length).toFixed(1)
    : 'N/A';

  let md = `# Cycle Review — ${cycleState.cycleId} (Cycle ${cycleState.cycleNumber})\n\n`;
  md    += `**Period:** ${formatDate(cycleState.startDate)} → ${formatDate(cycleState.endDate)}\n\n---\n\n`;
  md    += `## Eli\n\n`;
  md    += `| Routine | Sessions |\n|---|---|\n`;
  md    += `| Upper Push | ${cycleState.eliHeavyCounts.eli_upper_push} |\n`;
  md    += `| Lower Body | ${cycleState.eliHeavyCounts.eli_lower_body} |\n`;
  md    += `| Upper Pull | ${cycleState.eliHeavyCounts.eli_upper_pull} |\n`;
  md    += `| Full Body  | ${cycleState.eliHeavyCounts.eli_full_body}  |\n`;
  md    += `| Circuit    | ${cycleState.eliCircuitCount}  |\n`;
  md    += `| Cardio     | ${cycleState.eliCardioCount}   |\n`;
  md    += `| Mobility   | ${cycleState.eliMobilityCount} |\n\n`;
  md    += `**Average form fatigue:** ${avgF}/5\n\n---\n\n`;
  md    += `## Christina\n\n`;
  md    += `| Routine | Sessions |\n|---|---|\n`;
  const cr = cycleState.christinaRoutineCounts;
  md    += `| Gentle Upper | ${cr.christina_gentle_upper ?? 0} |\n`;
  md    += `| Gentle Lower | ${cr.christina_gentle_lower ?? 0} |\n`;
  md    += `| Gentle Pull/Posture | ${cr.christina_gentle_pull_posture ?? 0} |\n`;
  md    += `| Gentle Full Body | ${cr.christina_gentle_full_body ?? 0} |\n`;
  md    += `| Light Movement | ${cr.christina_light_movement ?? 0} |\n`;
  md    += `| Recovery | ${cr.christina_recovery_minimum ?? 0} |\n\n`;

  downloadFile(fname, md, 'text/markdown');
  return fname;
}
