import { $, el, toast } from '../util/dom.js';
import { fileCount, formatBytes, trackCount } from '../util/format.js';

/**
 * The export dialog: look before you copy, then watch it happen.
 *
 * Three states in one card - preview, progress, summary - because they are
 * the same conversation about the same folder, and swapping windows halfway
 * through would lose the thread. Nothing is written until the user has seen
 * where the files are going and how much room is left for them.
 */

const STEPS = ['preview', 'progress', 'summary'];

export function createExportDialog() {
  const modal = $('#export-modal');

  const steps = Object.fromEntries(STEPS.map((name) => [name, $(`#export-step-${name}`)]));
  const buttons = {
    close: $('#btn-export-close'),
    cancel: $('#btn-export-cancel'),
    change: $('#btn-export-change'),
    start: $('#btn-export-start'),
    stop: $('#btn-export-stop'),
    reveal: $('#btn-export-reveal'),
    done: $('#btn-export-done'),
  };

  /** What is being exported and where to. Null while the dialog is closed. */
  let job = null;
  let unsubscribe = null;

  function showStep(name) {
    for (const [key, node] of Object.entries(steps)) node.hidden = key !== name;

    const running = name === 'progress';
    const finished = name === 'summary';
    buttons.cancel.hidden = running || finished;
    buttons.start.hidden = running || finished;
    buttons.stop.hidden = !running;
    buttons.reveal.hidden = !finished;
    buttons.done.hidden = !finished;
    // Closing mid-copy would leave the copy running with nothing watching it.
    buttons.close.hidden = running;
  }

  function close() {
    unsubscribe?.();
    unsubscribe = null;
    job = null;
    modal.hidden = true;
  }

  /* ------------------------------------------------------------ preview */

  function renderPreview(plan) {
    $('#export-source').textContent = `${job.sourceLabel} · ${trackCount(plan.count)}`;
    $('#export-target').textContent = plan.targetDir;
    $('#export-size').textContent = `${formatBytes(plan.totalBytes)} (${fileCount(plan.count)})`;
    $('#export-free').textContent = formatBytes(plan.freeBytes);

    const rest = plan.freeBytes - plan.totalBytes;
    const fits = rest >= 0;
    $('#export-rest-row').hidden = !fits;
    $('#export-rest').textContent = formatBytes(rest);

    const warning = $('#export-warning');
    if (!fits) {
      warning.textContent = `Brakuje ${formatBytes(-rest)}. `
        + 'Zwolnij miejsce na urządzeniu albo wybierz inny cel.';
    } else if (plan.missing) {
      warning.textContent = `${fileCount(plan.missing)} zniknęły z dysku `
        + 'i zostaną pominięte.';
    }
    warning.hidden = fits && !plan.missing;

    $('#export-sample').replaceChildren(
      ...plan.sampleNames.map((name) => el('li', { text: name })),
    );

    buttons.start.disabled = !fits || plan.count === 0;
  }

  /** Ask the main process to measure, opening the folder picker when needed. */
  async function refreshPlan({ pickAgain = false } = {}) {
    const plan = await window.api.planExport({
      trackIds: job.trackIds,
      folderName: job.folderName,
      targetRoot: pickAgain ? null : job.targetRoot,
    });
    if (!plan) return false;

    job.targetRoot = plan.targetRoot;
    job.plan = plan;
    renderPreview(plan);
    return true;
  }

  /* ----------------------------------------------------------- progress */

  function renderProgress({ done, total, name, bytes }) {
    const share = total ? Math.round((done / total) * 100) : 0;
    $('#export-bar').style.width = `${share}%`;
    $('#export-counter').textContent = `${done} / ${total} · skopiowano ${formatBytes(bytes)}`;
    $('#export-current').textContent = name;
  }

  /* ------------------------------------------------------------ summary */

  function tallyRow(mark, className, text) {
    return el('li', {}, [
      el('span', { class: `tally-mark ${className}`, text: mark }),
      el('span', { text }),
    ]);
  }

  function renderSummary(result) {
    $('#export-summary-target').textContent = result.targetDir;

    const rows = [
      tallyRow('✓', 'tally-copied',
        `Skopiowano ${fileCount(result.copied)} · ${formatBytes(result.copiedBytes)}`),
    ];
    if (result.skipped) {
      rows.push(tallyRow('–', 'tally-skipped',
        `Pominięto ${fileCount(result.skipped)} — już były na miejscu`));
    }
    if (result.errors.length) {
      rows.push(tallyRow('✗', 'tally-failed',
        `Nie udało się skopiować ${fileCount(result.errors.length)}`));
    }
    if (result.canceled) {
      rows.push(tallyRow('■', 'tally-skipped', 'Kopiowanie przerwane'));
    }
    $('#export-tally').replaceChildren(...rows);

    const errorList = $('#export-errors');
    errorList.replaceChildren(...result.errors.map((error) => el('li', {}, [
      el('div', { class: 'error-name', text: error.name }),
      el('div', { class: 'error-reason', text: error.reason }),
    ])));
    errorList.hidden = result.errors.length === 0;
  }

  async function start() {
    showStep('progress');
    $('#export-progress-target').textContent = `Kopiowanie na ${job.plan.targetDir}`;
    renderProgress({ done: 0, total: job.plan.count, name: '', bytes: 0 });

    unsubscribe = window.api.onExportProgress(renderProgress);

    try {
      const result = await window.api.runExport({
        trackIds: job.trackIds,
        folderName: job.folderName,
        targetRoot: job.targetRoot,
      });
      job.targetDir = result.targetDir;
      renderSummary(result);
      showStep('summary');
    } catch (error) {
      console.error(error);
      close();
      toast('Eksport się nie powiódł');
    } finally {
      unsubscribe?.();
      unsubscribe = null;
    }
  }

  /* -------------------------------------------------------------- wiring */

  buttons.close.addEventListener('click', close);
  buttons.cancel.addEventListener('click', close);
  buttons.done.addEventListener('click', close);
  buttons.start.addEventListener('click', start);
  buttons.stop.addEventListener('click', () => window.api.cancelExport());
  buttons.change.addEventListener('click', () => refreshPlan({ pickAgain: true }));
  buttons.reveal.addEventListener('click', () => window.api.reveal(job.targetDir));

  // A click on the backdrop backs out, unless a copy is already under way.
  modal.addEventListener('pointerdown', (event) => {
    if (event.target === modal && steps.progress.hidden) close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || modal.hidden) return;
    // Escape is for backing out, not for abandoning a copy in flight.
    if (steps.progress.hidden) close();
  });

  /**
   * Open the dialog for a set of tracks.
   * @param {{trackIds: string[], folderName: string, sourceLabel: string}} request
   */
  async function open(request) {
    if (!request.trackIds.length) {
      toast('Nie ma czego eksportować');
      return;
    }

    job = { ...request, targetRoot: null, plan: null, targetDir: null };
    if (!await refreshPlan()) {
      job = null;
      return;
    }

    showStep('preview');
    modal.hidden = false;
    buttons.start.focus();
  }

  return { open };
}
