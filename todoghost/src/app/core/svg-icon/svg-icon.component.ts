import { Component, Input, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

const ICONS: Record<string, string> = {
  tiger: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="45" fill="#f59e0b"/><circle cx="30" cy="40" r="5" fill="#000"/><circle cx="70" cy="40" r="5" fill="#000"/><path d="M40,60 Q50,70 60,60" stroke="#000" stroke-width="3" fill="none"/><path d="M20,20 Q30,10 40,20" stroke="#000" stroke-width="4" fill="none"/><path d="M80,20 Q70,10 60,20" stroke="#000" stroke-width="4" fill="none"/></svg>`,
  rabbit: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><ellipse cx="50" cy="60" rx="35" ry="30" fill="#f3f4f6"/><ellipse cx="35" cy="25" rx="10" ry="25" fill="#f3f4f6"/><ellipse cx="65" cy="25" rx="10" ry="25" fill="#f3f4f6"/><circle cx="35" cy="55" r="4" fill="#000"/><circle cx="65" cy="55" r="4" fill="#000"/><circle cx="50" cy="65" r="3" fill="#fca5a5"/></svg>`,
  bengal: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" fill="#d97706"/><polygon points="10,20 30,30 20,50" fill="#d97706"/><polygon points="90,20 70,30 80,50" fill="#d97706"/><circle cx="35" cy="45" r="4" fill="#000"/><circle cx="65" cy="45" r="4" fill="#000"/><circle cx="50" cy="55" r="3" fill="#000"/><circle cx="30" cy="70" r="4" fill="#78350f"/><circle cx="70" cy="70" r="4" fill="#78350f"/><circle cx="50" cy="80" r="5" fill="#78350f"/></svg>`,
  golden: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="45" fill="#fbbf24"/><polygon points="15,25 35,35 25,55" fill="#fbbf24"/><polygon points="85,25 65,35 75,55" fill="#fbbf24"/><circle cx="35" cy="45" r="5" fill="#15803d"/><circle cx="65" cy="45" r="5" fill="#15803d"/><path d="M45,55 Q50,60 55,55" stroke="#000" stroke-width="2" fill="none"/></svg>`,
};

@Component({
  selector: 'app-svg-icon',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="svg-container" [innerHTML]="safeIcon"></div>`,
  styles: [`
    :host { display: inline-block; }
    .svg-container { width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; }
    ::ng-deep .svg-container svg { width: 100%; height: 100%; object-fit: contain; }
  `]
})
export class SvgIconComponent {
  @Input() name: string = '';
  @HostBinding('style.width') @Input() width = '24px';
  @HostBinding('style.height') @Input() height = '24px';

  constructor(private sanitizer: DomSanitizer) {}

  get safeIcon(): SafeHtml {
    const raw = ICONS[this.name] || ICONS['golden'];
    return this.sanitizer.bypassSecurityTrustHtml(raw);
  }
}
