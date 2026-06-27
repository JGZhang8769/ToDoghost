import { ApplicationRef, Injectable, inject } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { concat, filter, first, interval, take } from 'rxjs';

/**
 * Drives the silent auto-update flow for the PWA.
 *
 * The Angular service worker downloads new app shells in the background,
 * but by default it will only serve them to *new* page loads — existing
 * tabs keep showing the cached shell forever. That's how users get stuck
 * on an old build after a deploy.
 *
 * This service:
 *   1. Asks Angular SW to check for updates once the app stabilises, and
 *      again on a fixed interval, so we don't wait for a navigation event.
 *   2. When SW reports VERSION_READY, calls activateUpdate() to swap the
 *      cache atomically, then full-page reloads. The reload is the only
 *      reliable way to drop in-memory references to the old bundle.
 *   3. Falls back to a hard reload if SW is unrecoverable (corrupt cache,
 *      etc.) — better to refresh than to leave the user stranded.
 *
 * Why not just nuke caches on every page load? Two reasons:
 *   - It defeats the whole point of a PWA (offline-first, fast cold start)
 *   - Angular CLI's outputHashing already busts JS/CSS by filename; the
 *     only thing SW still owns is index.html + ngsw.json
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private swUpdate = inject(SwUpdate);
  private appRef = inject(ApplicationRef);

  // How often (ms) to poll for a new version once the app is idle.
  // 5 min strikes a balance: long enough not to hammer Cloudflare,
  // short enough to surface fresh deploys within one work session.
  private static readonly POLL_INTERVAL_MS = 5 * 60 * 1000;

  init() {
    if (!this.swUpdate.isEnabled) return;

    // 1) Start polling for updates once Angular reports stable.
    // Combining isStable + interval ensures the first check happens
    // after hydration (not during it) — otherwise we'd race the
    // initial SW registration.
    const appIsStable$ = this.appRef.isStable.pipe(first(stable => stable === true));
    const everyFiveMin$ = interval(AppUpdateService.POLL_INTERVAL_MS);
    concat(appIsStable$, everyFiveMin$).subscribe(() => {
      this.swUpdate.checkForUpdate().catch(err => {
        console.warn('[AppUpdate] checkForUpdate failed:', err);
      });
    });

    // 2) When a new version is fully downloaded, swap and reload.
    this.swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(async () => {
        try {
          await this.swUpdate.activateUpdate();
        } catch (err) {
          console.warn('[AppUpdate] activateUpdate failed; reloading anyway:', err);
        }
        // Reload at the next paint so users mid-typing have a chance
        // to commit; in practice this is near-instant.
        requestAnimationFrame(() => location.reload());
      });

    // 3) Hard recovery if the SW reports it is broken.
    this.swUpdate.unrecoverable.pipe(take(1)).subscribe(event => {
      console.warn('[AppUpdate] SW unrecoverable:', event.reason);
      location.reload();
    });
  }
}
