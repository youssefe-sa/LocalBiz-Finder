import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { BusinessResult } from './search.service';

@Component({
  selector: 'app-business-details',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="max-w-2xl font-sans flex flex-col max-h-[95vh] bg-white overflow-hidden rounded-3xl">
      <!-- Hero Image -->
      @if (data.thumbnailUrl || (data.images && data.images.length > 0)) {
        <div class="h-64 w-full relative shrink-0 bg-gray-100 flex items-center justify-center">
          <img [src]="getProxyUrl(data.thumbnailUrl || data.images?.[0])" 
               class="w-full h-full object-cover" 
               alt="Hero image"
               referrerPolicy="no-referrer"
               (error)="handleImageError($event)">
          <mat-icon class="text-gray-300 !text-5xl hidden">business</mat-icon>
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
          <button (click)="dialogRef.close()" 
                  class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/40 transition-all">
            <mat-icon>close</mat-icon>
          </button>
          <div class="absolute bottom-6 left-8 right-8">
            <div class="flex items-center gap-2 mb-2">
              <span class="px-2 py-0.5 bg-brand-500 text-white text-[10px] font-bold uppercase tracking-widest rounded">
                {{ data.category }}
              </span>
              @if (data.rating) {
                <div class="flex items-center text-amber-400 text-xs font-bold">
                  <mat-icon class="!text-sm mr-1">star</mat-icon>
                  {{ data.rating }} ({{ data.ratingCount }})
                </div>
              }
            </div>
            <h2 class="text-3xl font-bold text-white tracking-tight">{{ data.title }}</h2>
          </div>
        </div>
      } @else {
        <div class="p-8 pb-6 flex justify-between items-start shrink-0 bg-gray-50 border-b border-gray-100">
          <div>
            <h2 class="text-2xl font-bold text-gray-900 tracking-tight">{{ data.title }}</h2>
            <p class="text-gray-500 text-sm mt-1">{{ data.category }}</p>
          </div>
          <button mat-icon-button (click)="dialogRef.close()" class="text-gray-400">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      }

      <!-- Content -->
      <div class="p-8 overflow-y-auto flex-grow space-y-10 custom-scrollbar">
        <!-- Gallery -->
        @if (data.images && data.images.length > 0) {
          <section>
            <h3 class="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Galerie Photos</h3>
            <div class="grid grid-cols-3 gap-3">
              @for (img of data.images.slice(0, 6); track img) {
                <div class="aspect-square rounded-xl overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center group relative cursor-pointer">
                  <img [src]="getProxyUrl(img)" 
                       class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                       alt="Business photo" 
                       referrerPolicy="no-referrer"
                       (error)="handleImageError($event)">
                  <mat-icon class="text-gray-200 hidden">image</mat-icon>
                </div>
              }
            </div>
            @if (data.mapsUrl) {
              <div class="mt-4 text-center">
                <a [href]="data.mapsUrl + '&tab=photos'" target="_blank" class="text-[10px] text-brand-600 font-bold uppercase tracking-widest hover:underline">
                  Voir toutes les photos sur Google Maps
                </a>
              </div>
            }
          </section>
        }

        <!-- Description -->
        @if (data.description) {
          <section class="bg-brand-50/30 p-6 rounded-2xl border border-brand-100/50">
            <div class="flex items-center gap-2 mb-3">
              <mat-icon class="text-brand-600 !text-sm">auto_awesome</mat-icon>
              <h3 class="text-[11px] font-bold text-brand-700 uppercase tracking-widest">Analyse de l'IA</h3>
            </div>
            <p class="text-gray-700 leading-relaxed text-sm italic">"{{ data.description }}"</p>
          </section>
        }

        <!-- About / Features -->
        @if (data.about && data.about.length > 0) {
          <section>
            <h3 class="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Caractéristiques</h3>
            <div class="space-y-6">
              @for (cat of data.about; track cat.category) {
                <div>
                  <h4 class="text-[10px] font-bold text-gray-900 uppercase tracking-tighter mb-2 opacity-60">{{ cat.category }}</h4>
                  <div class="flex flex-wrap gap-2">
                    @for (item of cat.items; track item) {
                      <span class="px-3 py-1 bg-white border border-gray-100 text-gray-600 rounded-lg text-[10px] font-medium flex items-center shadow-sm">
                        <mat-icon class="!text-[10px] h-auto w-auto mr-1.5 text-brand-500">check</mat-icon>
                        {{ item }}
                      </span>
                    }
                  </div>
                </div>
              }
            </div>
          </section>
        }

        <div class="grid grid-cols-1 md:grid-cols-2 gap-10">
          <!-- Contact Info -->
          <section>
            <h3 class="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Informations</h3>
            <div class="space-y-4">
              @if (data.phoneNumber) {
                <div class="flex items-start gap-3 group">
                  <div class="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                    <mat-icon class="!text-sm">phone</mat-icon>
                  </div>
                  <div>
                    <p class="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Téléphone</p>
                    <p class="text-sm font-medium text-gray-900">{{ data.phoneNumber }}</p>
                  </div>
                </div>
              }
              @if (data.website) {
                <div class="flex items-start gap-3 group">
                  <div class="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                    <mat-icon class="!text-sm">language</mat-icon>
                  </div>
                  <div>
                    <p class="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Site Web</p>
                    <a [href]="data.website" target="_blank" class="text-sm font-medium text-brand-600 hover:underline truncate block max-w-[180px]">{{ data.website }}</a>
                  </div>
                </div>
              }
              @if (data.email) {
                <div class="flex items-start gap-3 group">
                  <div class="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                    <mat-icon class="!text-sm">email</mat-icon>
                  </div>
                  <div>
                    <p class="text-[9px] font-bold text-gray-400 uppercase tracking-widest">E-mail</p>
                    <a [href]="'mailto:' + data.email" class="text-sm font-medium text-brand-600 hover:underline truncate block max-w-[180px]">{{ data.email }}</a>
                  </div>
                </div>
              }
            </div>
          </section>

          <!-- Hours -->
          @if (data.hours) {
            <section>
              <h3 class="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Horaires</h3>
              <div class="space-y-2">
                @for (day of objectKeys(data.hours); track day) {
                  <div class="flex justify-between text-xs">
                    <span class="text-gray-400 capitalize">{{ day }}</span>
                    <span class="text-gray-900 font-medium">{{ data.hours[day] }}</span>
                  </div>
                }
              </div>
            </section>
          }
        </div>

        <!-- Reviews -->
        @if (data.reviews && data.reviews.length > 0) {
          <section>
            <div class="flex justify-between items-center mb-6">
              <h3 class="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Derniers Avis</h3>
              <div class="px-2 py-1 bg-amber-50 text-amber-700 rounded text-[10px] font-bold">
                {{ data.ratingCount }} avis au total
              </div>
            </div>
            <div class="space-y-4">
              @for (review of data.reviews.slice(0, 5); track review.snippet) {
                <div class="p-5 bg-gray-50/50 rounded-2xl border border-gray-100 hover:bg-white hover:shadow-md transition-all duration-300">
                  <div class="flex justify-between items-center mb-3">
                    <div class="flex items-center gap-2">
                      <div class="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500">
                        {{ review.user.charAt(0) }}
                      </div>
                      <span class="text-xs font-bold text-gray-900">{{ review.user }}</span>
                    </div>
                    <div class="flex items-center">
                      @for (s of [1,2,3,4,5]; track s) {
                        <mat-icon class="!text-[10px] h-auto w-auto" [class.text-amber-400]="s <= review.rating" [class.text-gray-200]="s > review.rating">star</mat-icon>
                      }
                    </div>
                  </div>
                  <p class="text-xs text-gray-600 leading-relaxed italic">"{{ review.snippet }}"</p>
                  @if (review.date) {
                    <p class="text-[9px] text-gray-400 mt-3 font-medium uppercase tracking-widest">{{ review.date }}</p>
                  }
                </div>
              }
            </div>
          </section>
        }
      </div>

      <!-- Footer -->
      <div class="p-8 pt-6 border-t border-gray-100 flex justify-between items-center shrink-0 bg-gray-50/30">
        @if (data.mapsUrl) {
          <a [href]="data.mapsUrl" target="_blank" mat-button class="!text-gray-400 hover:!text-brand-600 !text-xs !font-bold !uppercase !tracking-widest">
            <mat-icon class="mr-2">map</mat-icon>
            Ouvrir dans Maps
          </a>
        }
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
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #d1d5db;
    }
  `]
})
export class BusinessDetails {
  data: BusinessResult = inject(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<BusinessDetails>);

  handleImageError(event: any) {
    const img = event.target as HTMLImageElement;
    img.classList.add('hidden');
    const next = img.nextElementSibling as HTMLElement;
    if (next && next.tagName.toLowerCase() === 'mat-icon') {
      next.classList.remove('hidden');
      next.classList.add('block');
    }
  }

  getProxyUrl(url: string | undefined): string {
    if (!url) return '';
    if (url.startsWith('data:')) return url;
    return `/api/proxy-image?url=${encodeURIComponent(url)}`;
  }

  objectKeys(obj: any) {
    return obj ? Object.keys(obj) : [];
  }
}
