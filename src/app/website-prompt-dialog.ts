import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { BusinessResult } from './search.service';

@Component({
  selector: 'app-website-prompt-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="max-w-3xl font-sans flex flex-col max-h-[90vh] bg-white overflow-hidden rounded-3xl">
      <div class="p-8 pb-6 flex justify-between items-start shrink-0 bg-indigo-50 border-b border-indigo-100">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
            <mat-icon>web</mat-icon>
          </div>
          <div>
            <h2 class="text-xl font-bold text-gray-900 tracking-tight">Prompt de Création Web</h2>
            <p class="text-indigo-600 text-[10px] font-bold uppercase tracking-widest mt-0.5">{{ data.title }}</p>
          </div>
        </div>
        <button mat-icon-button (click)="dialogRef.close()" class="text-gray-400">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="p-8 overflow-y-auto flex-grow custom-scrollbar bg-gray-50/30">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Prompt Isolé & Optimisé</h3>
          <button (click)="copyToClipboard(data.websitePrompt!)" 
                  class="flex items-center gap-2 px-4 py-2 bg-white border border-indigo-100 rounded-xl text-[11px] font-bold text-indigo-600 uppercase tracking-widest hover:bg-indigo-50 transition-all shadow-sm">
            <mat-icon class="!text-sm">content_copy</mat-icon>
            Copier le prompt
          </button>
        </div>

        <div class="bg-white p-8 rounded-2xl border border-indigo-100 shadow-sm text-gray-700 text-sm leading-relaxed whitespace-pre-wrap font-mono relative group">
          <div class="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <mat-icon class="text-indigo-100 !text-4xl">format_quote</mat-icon>
          </div>
          {{ data.websitePrompt }}
        </div>

        <div class="mt-8 p-6 bg-amber-50 rounded-2xl border border-amber-100">
          <div class="flex items-center gap-2 mb-2">
            <mat-icon class="text-amber-600 !text-sm">info</mat-icon>
            <h4 class="text-[10px] font-bold text-amber-800 uppercase tracking-widest">Conseil d'utilisation</h4>
          </div>
          <p class="text-amber-700 text-xs leading-relaxed">
            Ce prompt est optimisé pour les outils de création de sites web par IA (Framer AI, Webflow, etc.). 
            Il inclut déjà les visuels, les animations et la structure professionnelle demandée.
          </p>
        </div>
      </div>

      <div class="p-8 pt-6 border-t border-gray-100 flex justify-end items-center shrink-0 bg-white">
        <button mat-flat-button (click)="dialogRef.close()" class="!rounded-xl !bg-gray-900 !text-white !px-8 !h-11 font-bold">Fermer</button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .custom-scrollbar::-webkit-scrollbar {
      width: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #e5e7eb;
      border-radius: 10px;
    }
  `]
})
export class WebsitePromptDialog {
  data: BusinessResult = inject(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<WebsitePromptDialog>);

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      // Feedback could be added here
    });
  }
}
