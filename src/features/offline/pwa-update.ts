const workerContainer = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
let pageController = workerContainer?.controller;
if (workerContainer && !pageController) {
  workerContainer.addEventListener('controllerchange', () => {
    pageController = workerContainer.controller;
  }, { once: true });
}

function waitForChange(target: EventTarget, event: string, ready: () => boolean) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      target.removeEventListener(event, check);
      reject(new Error('The app update did not finish in time.'));
    }, 30_000);

    function check() {
      if (!ready()) return;
      clearTimeout(timeout);
      target.removeEventListener(event, check);
      resolve();
    }

    target.addEventListener(event, check);
    check();
  });
}

export async function checkForAppUpdate() {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  if (navigator.onLine === false) throw new Error('An internet connection is needed to check for updates.');

  const workers = navigator.serviceWorker;
  const registration = await workers.getRegistration();
  if (!registration?.active) return 'unsupported';
  const previous = workers.controller ?? registration.active;
  await registration.update();

  const installing = registration.installing;
  if (installing) {
    await waitForChange(installing, 'statechange', () =>
      installing.state !== 'installing' && installing.state !== 'parsed',
    );
    if (installing.state === 'redundant') throw new Error('The app update could not be downloaded.');
  }

  const waiting = registration.waiting;
  if (waiting || registration.active !== previous) {
    const activated = waitForChange(workers, 'controllerchange', () =>
      workers.controller !== null && workers.controller !== previous,
    );
    waiting?.postMessage({ type: 'ACTIVATE_UPDATE' });
    await activated;
  } else if (!pageController || workers.controller === pageController) {
    return 'current';
  }

  window.location.reload();
  return 'reloading';
}
