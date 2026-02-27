import { ChangeDetectionStrategy, Component, signal, inject, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { SearchService, BusinessResult, Campaign } from './search.service';
import { LocalStorageService } from './local-storage.service';
import { BusinessDetails } from './business-details';
import { animate, stagger } from 'motion';
import { GoogleGenAI, Type } from "@google/genai";
import * as XLSX from 'xlsx';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-search',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatInputModule,
    MatButtonModule,
    MatTableModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatDialogModule,
    MatSelectModule,
    MatTooltipModule,
    MatCheckboxModule,
    MatMenuModule,
    MatSnackBarModule
  ],
  templateUrl: './search.html',
  styleUrl: './app.css',
})
export class Search implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private searchService = inject(SearchService);
  private localStorageService = inject(LocalStorageService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  private autoSaveInterval: any;

  searchForm = this.fb.group({
    campaignName: [''],
    keyword: [''],
    city: [''],
    mapsUrl: ['']
  });

  showOnlyWithEmail = signal(false);
  websiteFilter = signal<'all' | 'with' | 'without'>('all');

  currentCampaignName = signal<string>('');
  searchDate = signal<string>('');

  searchSteps = signal<{ label: string, comment: string, status: 'pending' | 'active' | 'done' }[]>([
    { label: 'Initialisation', comment: 'Préparation...', status: 'pending' },
    { label: 'Maps Engine', comment: 'Scan...', status: 'pending' },
    { label: 'Data Mining', comment: 'Extraction...', status: 'pending' },
    { label: 'AI Synthesis', comment: 'Analyse...', status: 'pending' },
    { label: 'Finalisation', comment: 'Optimisation...', status: 'pending' }
  ]);

  enrichmentStatus = signal<{ active: boolean, label: string, comment: string, progress: number }>({
    active: false,
    label: '',
    comment: '',
    progress: 0
  });

  results = signal<BusinessResult[]>([]);
  isLoading = signal(false);
  isSaving = signal(false);
  hasSearched = signal(false);
  searchError = signal<string | null>(null);
  expandedIds = signal<Set<string>>(new Set());
  enrichingIds = signal<Set<string>>(new Set());

  filteredResults = computed(() => {
    let allResults = this.results();
    if (this.showOnlyWithEmail()) allResults = allResults.filter(r => !!r.email);
    if (this.websiteFilter() === 'with') allResults = allResults.filter(r => !!r.website);
    else if (this.websiteFilter() === 'without') allResults = allResults.filter(r => !r.website);
    return allResults;
  });

  displayedColumns: string[] = ['title', 'description', 'address', 'website', 'email', 'rating', 'actions'];

  ngOnInit() {
    if (isPlatformBrowser(this.localStorageService.platformId)) {
      this.loadDraft();
      this.startAutoSaveTimer();
    }
  }

  ngOnDestroy() {
    if (this.autoSaveInterval) clearInterval(this.autoSaveInterval);
  }

  private loadDraft() {
    const draft = this.localStorageService.loadDraft();
    if (draft && draft.results?.length > 0) {
      this.results.set(draft.results);
      this.currentCampaignName.set(draft.name);
      this.searchDate.set(draft.date);
      this.hasSearched.set(true);
      this.searchForm.patchValue({
        campaignName: draft.name,
        keyword: draft.keyword,
        city: draft.city,
        mapsUrl: draft.mapsUrl
      });
      this.snackBar.open('Dernière session restaurée', 'Fermer', { duration: 3000 });
    }
  }

  private startAutoSaveTimer() {
    this.autoSaveInterval = setInterval(() => {
      this.saveToLocalStorage();
    }, 5 * 60 * 1000); // 5 minutes
  }

  private saveToLocalStorage() {
    if (this.results().length > 0) {
      const { keyword, city, mapsUrl } = this.searchForm.value;
      const draft = {
        name: this.currentCampaignName(),
        date: this.searchDate(),
        results: this.results(),
        keyword,
        city,
        mapsUrl
      };
      this.localStorageService.saveDraft(draft);
      console.log('Autosave to local storage complete');
    }
  }

  async onSearch() {
    const { keyword, city, campaignName, mapsUrl } = this.searchForm.value;
    if (!mapsUrl && !keyword && !city) return;

    this.isLoading.set(true);
    this.hasSearched.set(true);
    this.searchError.set(null);
    this.results.set([]); 
    
    const campaignLabel = campaignName || (mapsUrl ? 'Extraction via URL' : (keyword ? `Recherche: ${keyword}` : 'Recherche ciblée'));
    this.currentCampaignName.set(campaignLabel);
    this.searchDate.set(new Date().toLocaleString('fr-FR', { 
      day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' 
    }));
    
    this.searchSteps.set([
      { label: 'Initialisation', comment: 'Connexion...', status: 'active' },
      { label: 'Maps Engine', comment: 'En attente...', status: 'pending' },
      { label: 'Data Mining', comment: 'En attente...', status: 'pending' },
      { label: 'AI Synthesis', comment: 'En attente...', status: 'pending' },
      { label: 'Finalisation', comment: 'En attente...', status: 'pending' }
    ]);

    if (mapsUrl) await this.scrapeFromMapsUrl(mapsUrl);
    else this.searchWithSerper(keyword!, city!);
  }

  private searchWithSerper(keyword: string, city: string) {
    this.updateStep(0, 'done', 'Prêt.');
    this.updateStep(1, 'active', `Scan...`);
    this.searchService.search(keyword || '', city || '').subscribe({
      next: (response) => {
        const places = (response.places || []).map(p => ({
          ...p,
          mapsUrl: p.cid ? `https://www.google.com/maps?cid=${p.cid}` : undefined
        }));
        this.runVisualSteps(places, city || 'la zone');
      },
      error: (err) => {
        this.isLoading.set(false);
        const errorMsg = err.error?.details || err.error?.error || err.message;
        this.searchError.set(errorMsg);
        this.updateStep(1, 'pending', 'Erreur: ' + errorMsg);
        this.snackBar.open('Erreur de recherche: ' + errorMsg, 'Fermer', { duration: 5000 });
      }
    });
  }

  private async scrapeFromMapsUrl(url: string) {
    this.updateStep(0, 'done', 'Analyse URL...');
    this.updateStep(1, 'active', 'Extraction IA...');
    try {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Extract businesses from: ${url}`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              places: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    address: { type: Type.STRING },
                    phoneNumber: { type: Type.STRING },
                    website: { type: Type.STRING },
                    rating: { type: Type.NUMBER },
                    ratingCount: { type: Type.NUMBER },
                    category: { type: Type.STRING },
                    cid: { type: Type.STRING }
                  },
                  required: ["title", "address"]
                }
              }
            },
            required: ["places"]
          }
        }
      });
      const data = JSON.parse(response.text || '{"places": []}');
      const places = (data.places || []).map((p: any) => ({
        ...p,
        mapsUrl: p.cid ? `https://www.google.com/maps?cid=${p.cid}` : undefined
      }));
      this.runVisualSteps(places, 'URL');
    } catch (err: any) {
      this.isLoading.set(false);
      const errorMsg = err.message || 'Erreur IA inconnue';
      this.searchError.set(errorMsg);
      this.updateStep(1, 'pending', 'Erreur IA.');
      this.snackBar.open('Erreur d\'extraction IA: ' + errorMsg, 'Fermer', { duration: 5000 });
    }
  }

  clearSearch() {
    this.searchForm.reset();
    this.results.set([]);
    this.hasSearched.set(false);
  }

  private runVisualSteps(data: BusinessResult[], city: string) {
    setTimeout(() => {
      this.updateStep(1, 'done', data.length + ' localisés.');
      this.updateStep(2, 'active', 'Extraction...');
      setTimeout(() => {
        this.updateStep(2, 'done', 'Extraites.');
        this.updateStep(3, 'active', 'Analyse...');
        setTimeout(() => {
          this.updateStep(3, 'done', 'Terminée.');
          this.updateStep(4, 'active', 'Affichage...');
          setTimeout(() => {
            this.results.set(data);
            this.isLoading.set(false);
            this.updateStep(4, 'done', 'Prêt.');
            this.animateResults();
            this.autoSave();
          }, 400);
        }, 600);
      }, 500);
    }, 800);
  }

  private autoSave() {
    const { keyword, city, mapsUrl } = this.searchForm.value;
    const campaign: Campaign = {
      name: this.currentCampaignName(),
      date: this.searchDate(),
      results: this.results(),
      keyword: keyword || undefined,
      city: city || undefined,
      mapsUrl: mapsUrl || undefined
    };
    this.searchService.saveCampaign(campaign).subscribe();
    this.saveToLocalStorage();
  }

  private updateStep(index: number, status: 'pending' | 'active' | 'done', comment?: string) {
    this.searchSteps.update(steps => {
      const next = [...steps];
      next[index] = { ...next[index], status, comment: comment || next[index].comment };
      return next;
    });
  }

  async enrichAll() {
    const toEnrich = this.results().filter(r => !r.email || !r.description);
    if (toEnrich.length === 0) return;
    this.enrichmentStatus.set({ active: true, label: 'Enrichissement', comment: 'Démarrage...', progress: 0 });
    let count = 0;
    for (const biz of toEnrich) {
      count++;
      this.enrichmentStatus.update(s => ({ ...s, comment: `Analyse ${biz.title}...`, progress: Math.round((count/toEnrich.length)*100) }));
      await this.enrichWithAI(biz, true);
    }
    this.enrichmentStatus.update(s => ({ ...s, comment: 'Terminé.', progress: 100 }));
    setTimeout(() => this.enrichmentStatus.update(s => ({ ...s, active: false })), 2000);
    this.autoSave(); // Save again after enrichment
  }

  async enrichWithAI(business: BusinessResult, silent = false) {
    const id = business.cid || business.title;
    if (this.enrichingIds().has(id)) return;
    if (!silent) this.enrichmentStatus.set({ active: true, label: 'Analyse IA', comment: 'Recherche...', progress: 10 });
    this.enrichingIds.update(ids => new Set(ids).add(id));
    try {
      if (business.website) {
        await new Promise(resolve => {
          this.searchService.scrapeImages(business.website!).subscribe({
            next: (scrapeData) => {
              if (scrapeData.images?.length > 0) {
                this.results.update(results => results.map(r => (r.cid || r.title) === id ? { ...r, images: Array.from(new Set([...(r.images || []), ...scrapeData.images])) } : r));
              }
              resolve(true);
            }, error: () => resolve(false)
          });
        });
      }
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze ${business.title} at ${business.address}`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              email: { type: Type.STRING },
              description: { type: Type.STRING },
              images: { type: Type.ARRAY, items: { type: Type.STRING } },
              reviews: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { user: { type: Type.STRING }, rating: { type: Type.NUMBER }, snippet: { type: Type.STRING } } } },
              about: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { category: { type: Type.STRING }, items: { type: Type.ARRAY, items: { type: Type.STRING } } } } }
            },
            required: ["description"]
          }
        }
      });
      const data = JSON.parse(response.text || '{}');
      this.results.update(results => results.map(r => (r.cid || r.title) === id ? { ...r, email: r.email || data.email, description: data.description, reviews: data.reviews, about: data.about, images: Array.from(new Set([...(r.images || []), ...(data.images || [])])) } : r));
    } finally {
      this.enrichingIds.update(ids => { const next = new Set(ids); next.delete(id); return next; });
      if (!silent) this.enrichmentStatus.update(s => ({ ...s, active: false }));
    }
  }

  exportResults(format: 'csv' | 'xlsx') {
    const data = this.filteredResults().map(r => ({ 'Nom': r.title, 'Email': r.email || '', 'Site': r.website || '', 'Tel': r.phoneNumber || '', 'Adresse': r.address }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Prospects');
    if (format === 'xlsx') XLSX.writeFile(wb, `export_${Date.now()}.xlsx`);
    else {
      const csv = XLSX.utils.sheet_to_csv(ws);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      link.download = `export_${Date.now()}.csv`;
      link.click();
    }
  }

  getProxyUrl(url: string | undefined): string {
    return url ? (url.startsWith('data:') ? url : `/api/proxy-image?url=${encodeURIComponent(url)}`) : '';
  }

  openDetails(business: BusinessResult) {
    this.dialog.open(BusinessDetails, { data: business, width: '640px', maxWidth: '95vw', panelClass: 'custom-dialog-container' });
  }

  private animateResults() {
    setTimeout(() => {
      const rows = document.querySelectorAll('tr.mat-mdc-row');
      if (rows.length > 0) animate(rows, { opacity: [0, 1], y: [20, 0] }, { delay: stagger(0.05), duration: 0.5 });
    }, 0);
  }
}
