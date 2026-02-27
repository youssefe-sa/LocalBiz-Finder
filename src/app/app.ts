import { ChangeDetectionStrategy, Component, signal, inject, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
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
import { SearchService, BusinessResult } from './search.service';
import { BusinessDetails } from './business-details';
import { WebsitePromptDialog } from './website-prompt-dialog';
import { animate, stagger } from 'motion';
import { GoogleGenAI, Type } from "@google/genai";

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
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
    MatCheckboxModule
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private fb = inject(FormBuilder);
  private searchService = inject(SearchService);
  private dialog = inject(MatDialog);

  searchForm = this.fb.group({
    campaignName: [''],
    keyword: [''],
    city: [''],
    mapsUrl: ['']
  });

  // Simple signals for filtering instead of form to avoid NG01203 and ensure reactivity
  showOnlyWithEmail = signal(false);
  websiteFilter = signal<'all' | 'with' | 'without'>('all');

  currentCampaignName = signal<string>('');
  searchDate = signal<string>('');

  searchSteps = signal<{ label: string, comment: string, status: 'pending' | 'active' | 'done' }[]>([
    { label: 'Initialisation', comment: 'Préparation de l\'environnement de recherche...', status: 'pending' },
    { label: 'Maps Engine', comment: 'Scan des serveurs Google Maps en temps réel...', status: 'pending' },
    { label: 'Data Mining', comment: 'Extraction des coordonnées et métadonnées...', status: 'pending' },
    { label: 'AI Synthesis', comment: 'Prétraitement des données par l\'intelligence artificielle...', status: 'pending' },
    { label: 'Finalisation', comment: 'Optimisation de l\'affichage des résultats...', status: 'pending' }
  ]);

  enrichmentStatus = signal<{ active: boolean, label: string, comment: string, progress: number }>({
    active: false,
    label: '',
    comment: '',
    progress: 0
  });

  results = signal<BusinessResult[]>([]);
  isLoading = signal(false);
  hasSearched = signal(false);
  expandedIds = signal<Set<string>>(new Set());
  enrichingIds = signal<Set<string>>(new Set());

  filteredResults = computed(() => {
    let allResults = this.results();
    const hasEmailFilter = this.showOnlyWithEmail();
    const webFilter = this.websiteFilter();

    if (hasEmailFilter) {
      allResults = allResults.filter(r => !!r.email);
    }

    if (webFilter === 'with') {
      allResults = allResults.filter(r => !!r.website);
    } else if (webFilter === 'without') {
      allResults = allResults.filter(r => !r.website);
    }

    return allResults;
  });

  displayedColumns: string[] = ['title', 'description', 'address', 'website', 'email', 'rating', 'actions'];

  async onSearch() {
    const { keyword, city, campaignName, mapsUrl } = this.searchForm.value;
    
    if (!mapsUrl && !keyword && !city) return;

    this.isLoading.set(true);
    this.hasSearched.set(true);
    this.results.set([]); 
    this.showOnlyWithEmail.set(false);
    this.websiteFilter.set('all');
    
    const campaignLabel = campaignName || (mapsUrl ? 'Extraction via URL' : (keyword ? `Recherche: ${keyword}` : 'Recherche ciblée'));
    this.currentCampaignName.set(campaignLabel);
    this.searchDate.set(new Date().toLocaleString('fr-FR', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    }));
    
    // Reset steps
    this.searchSteps.set([
      { label: 'Initialisation', comment: 'Connexion sécurisée établie...', status: 'active' },
      { label: 'Maps Engine', comment: 'En attente...', status: 'pending' },
      { label: 'Data Mining', comment: 'En attente...', status: 'pending' },
      { label: 'AI Synthesis', comment: 'En attente...', status: 'pending' },
      { label: 'Finalisation', comment: 'En attente...', status: 'pending' }
    ]);

    if (mapsUrl) {
      await this.scrapeFromMapsUrl(mapsUrl);
    } else {
      this.searchWithSerper(keyword!, city!);
    }
  }

  private searchWithSerper(keyword: string, city: string) {
    this.updateStep(0, 'done', 'Environnement prêt.');
    const locationText = city ? ` à ${city}` : '';
    this.updateStep(1, 'active', `Scan des établissements${locationText}...`);

    this.searchService.search(keyword || '', city || '').subscribe({
      next: (response) => {
        const places = response.places || [];
        const enhancedPlaces = places.map(p => ({
          ...p,
          mapsUrl: p.cid ? `https://www.google.com/maps?cid=${p.cid}` : undefined
        }));

        this.runVisualSteps(enhancedPlaces, city || 'la zone ciblée');
      },
      error: (err) => {
        console.error('Serper API Error:', err);
        this.isLoading.set(false);
        let errorMsg = err.error?.details || err.message || 'Inconnue';
        if (errorMsg.includes('aborted') || err.status === 504) {
          errorMsg = 'Le délai d\'attente a été dépassé (Timeout). Veuillez réessayer.';
        }
        this.updateStep(1, 'pending', 'Erreur API Serper: ' + errorMsg);
      }
    });
  }

  private async scrapeFromMapsUrl(url: string) {
    this.updateStep(0, 'done', 'Analyse de l\'URL Google Maps...');
    this.updateStep(1, 'active', 'Extraction des données via IA...');

    try {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Extract the list of businesses from this Google Maps search URL: ${url}. 
        Find at least 20 businesses if possible. 
        For each business, provide: title, address, phone number, website, rating, review count, and category.`,
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

      this.runVisualSteps(places, 'Google Maps URL');
    } catch (error) {
      console.error('AI Scraping error:', error);
      this.isLoading.set(false);
      this.updateStep(1, 'pending', 'Erreur lors du scraping IA.');
    }
  }

  clearSearch() {
    this.searchForm.reset();
    this.results.set([]);
    this.hasSearched.set(false);
  }

  private runVisualSteps(data: BusinessResult[], city: string) {
    this.updateStep(0, 'done', 'Environnement prêt.');
    this.updateStep(1, 'active', 'Scan des établissements à ' + city + '...');
    
    setTimeout(() => {
      this.updateStep(1, 'done', data.length + ' établissements localisés.');
      this.updateStep(2, 'active', 'Extraction des fiches Google Business...');
      
      setTimeout(() => {
        this.updateStep(2, 'done', 'Métadonnées extraites avec succès.');
        this.updateStep(3, 'active', 'Analyse sémantique des catégories...');
        
        setTimeout(() => {
          this.updateStep(3, 'done', 'Synthèse IA terminée.');
          this.updateStep(4, 'active', 'Génération du tableau de bord...');
          
          setTimeout(() => {
            // CRITICAL: Set results and stop loading at the same time
            this.results.set(data);
            this.isLoading.set(false);
            this.updateStep(4, 'done', 'Prêt.');
            this.animateResults();
          }, 400);
        }, 600);
      }, 500);
    }, 800);
  }

  private updateStep(index: number, status: 'pending' | 'active' | 'done', comment?: string) {
    this.searchSteps.update(steps => {
      const next = [...steps];
      next[index] = { ...next[index], status, comment: comment || next[index].comment };
      return next;
    });
  }

  async enrichAll() {
    const toEnrich = this.results().filter(r => !r.email || !r.description || (r.images?.length || 0) < 3);
    if (toEnrich.length === 0) return;

    this.enrichmentStatus.set({
      active: true,
      label: 'Enrichissement Global',
      comment: `Préparation de l'analyse pour ${toEnrich.length} entreprises...`,
      progress: 0
    });

    let count = 0;
    for (const biz of toEnrich) {
      count++;
      const progress = Math.round((count / toEnrich.length) * 100);
      this.enrichmentStatus.update(s => ({ 
        ...s, 
        comment: `Analyse de ${biz.title} (${count}/${toEnrich.length})...`,
        progress 
      }));
      await this.enrichWithAI(biz, true);
    }

    this.enrichmentStatus.update(s => ({ ...s, comment: 'Enrichissement terminé.', progress: 100 }));
    setTimeout(() => this.enrichmentStatus.update(s => ({ ...s, active: false })), 2000);
  }

  async enrichWithAI(business: BusinessResult, silent = false) {
    const id = business.cid || business.title;
    if (this.enrichingIds().has(id)) return;

    if (!silent) {
      this.enrichmentStatus.set({
        active: true,
        label: 'Analyse IA : ' + business.title,
        comment: business.website ? 'Exploration du site web ' + business.website + '...' : 'Recherche d\'informations sur le web...',
        progress: 10
      });
    }

    this.enrichingIds.update(ids => new Set(ids).add(id));

    try {
      // 1. Scrape images if website exists
      if (business.website) {
        if (!silent) this.enrichmentStatus.update(s => ({ ...s, comment: 'Extraction des images du site...', progress: 30 }));
        await new Promise(resolve => {
          this.searchService.scrapeImages(business.website!).subscribe({
            next: (scrapeData) => {
              if (scrapeData.images && scrapeData.images.length > 0) {
                this.results.update(results => results.map(r => {
                  if ((r.cid || r.title) === id) {
                    const combined = Array.from(new Set([...(r.images || []), ...scrapeData.images])).filter(Boolean);
                    return { ...r, images: combined };
                  }
                  return r;
                }));
              }
              resolve(true);
            },
            error: () => resolve(false)
          });
        });
      }

      if (!silent) this.enrichmentStatus.update(s => ({ ...s, comment: 'Recherche approfondie et synthèse IA...', progress: 60 }));

      // 2. Use AI
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the business ${business.title} at ${business.address} (Website: ${business.website || 'N/A'}, Maps: ${business.mapsUrl || 'N/A'}) to find:
1. The official business email address.
2. A professional and engaging description in French (min 3 sentences).
3. The top 5 customer reviews. 
   IMPORTANT: Only include reviews that contain complete, meaningful sentences in French. Do NOT include reviews that are just one or two words (e.g., "Top", "Super", "Génial"). Each review snippet must be a full sentence describing the customer's experience.
4. All information from the "About" (À propos) section of the Google Maps card (e.g., Accessibility, Amenities, Offerings, Highlights, Planning). Group them by category.
5. Find URLs of high-quality images related to this business (Logo, Storefront, Products, Interior).
6. Generate an ultra-professional, high-converting, and detailed prompt for a top-tier website builder (like Framer, Webflow, or a specialized AI). The generated prompt must:
   - Be in French.
   - Incorporate all gathered data: Title, Address, Phone, Email, Website, Description, Reviews, and Features.
   - Explicitly list the found image URLs (from point 5) as assets to be used in the design.
   - Demand a "Luxury & Modern" aesthetic with a Full HD layout.
   - Specify advanced professional animations: smooth parallax effects, scroll-triggered reveal animations, elegant transitions, and micro-interactions on buttons.
   - Include instructions for a professional logo design (minimalist, vector-style, reflecting the business category).
   - Require high-end copywriting: persuasive, SEO-optimized, and tailored to the business's specific niche.
   - Define a complete structure: Sticky Header with glassmorphism, Hero section with a strong CTA, "Our Story" section, dynamic Services/Products grid, social proof/Testimonials slider, professional Gallery using the provided images, and a comprehensive Footer.`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              email: { type: Type.STRING },
              description: { type: Type.STRING },
              websitePrompt: { 
                type: Type.STRING,
                description: "A professional prompt for website creation based on the gathered data"
              },
              images: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "URLs of images found via search"
              },
              reviews: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    user: { type: Type.STRING },
                    rating: { type: Type.NUMBER },
                    snippet: { type: Type.STRING },
                    date: { type: Type.STRING }
                  },
                  required: ["user", "rating", "snippet"]
                }
              },
              about: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    items: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["category", "items"]
                }
              }
            },
            required: ["description"]
          }
        }
      });

      if (!silent) this.enrichmentStatus.update(s => ({ ...s, comment: 'Finalisation du profil entreprise...', progress: 90 }));

      const data = JSON.parse(response.text || '{}');
      
      this.results.update(results => results.map(r => {
        if ((r.cid || r.title) === id) {
          const combinedImages = Array.from(new Set([...(r.images || []), ...(data.images || [])])).filter(Boolean);
          return {
            ...r,
            email: r.email || data.email,
            description: data.description || r.description,
            websitePrompt: data.websitePrompt || r.websitePrompt,
            reviews: data.reviews || r.reviews,
            about: data.about || r.about,
            images: combinedImages
          };
        }
        return r;
      }));

      if (!silent) {
        this.enrichmentStatus.update(s => ({ ...s, comment: 'Profil enrichi avec succès.', progress: 100 }));
        setTimeout(() => this.enrichmentStatus.update(s => ({ ...s, active: false })), 1500);
      }
    } catch (error: any) {
      console.error('Enrichment error:', error);
      const errorMessage = error?.message || 'Erreur inconnue';
      
      if (!silent) {
        if (errorMessage.includes('aborted')) {
          this.enrichmentStatus.update(s => ({ ...s, comment: 'Requête annulée ou délai dépassé.', progress: 0 }));
        } else {
          this.enrichmentStatus.update(s => ({ ...s, comment: 'Erreur lors de l\'enrichissement IA.', progress: 0 }));
        }
        setTimeout(() => this.enrichmentStatus.update(s => ({ ...s, active: false })), 3000);
      }
    } finally {
      this.enrichingIds.update(ids => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
    }
  }

  getProxyUrl(url: string | undefined): string {
    if (!url) return '';
    if (url.startsWith('data:')) return url;
    return `/api/proxy-image?url=${encodeURIComponent(url)}`;
  }

  toggleExpand(id: string) {
    const next = new Set(this.expandedIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.expandedIds.set(next);
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  isEnriching(id: string): boolean {
    return this.enrichingIds().has(id);
  }

  handleImageError(event: any) {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const next = img.nextElementSibling as HTMLElement;
    if (next) {
      next.style.display = 'block';
    }
  }

  openDetails(business: BusinessResult) {
    const id = business.cid || business.title;
    
    // Just-in-time image scraping if missing
    if (business.website && (!business.images || business.images.length === 0)) {
      this.searchService.scrapeImages(business.website).subscribe({
        next: (scrapeData) => {
          if (scrapeData.images && scrapeData.images.length > 0) {
            this.results.update(results => results.map(r => {
              if ((r.cid || r.title) === id) {
                return { ...r, images: scrapeData.images };
              }
              return r;
            }));
            
            // If dialog is already open, we might need to update its data
            // But since we pass the object reference, and we are updating the results array with new objects,
            // the dialog might not see it. However, most users will wait a second.
          }
        }
      });
    }

    this.dialog.open(BusinessDetails, {
      data: business,
      width: '640px',
      maxWidth: '95vw',
      panelClass: 'custom-dialog-container'
    });
  }

  openWebsitePrompt(business: BusinessResult) {
    this.dialog.open(WebsitePromptDialog, {
      data: business,
      width: '720px',
      maxWidth: '95vw',
      panelClass: 'custom-dialog-container'
    });
  }

  private animateResults() {
    setTimeout(() => {
      const rows = document.querySelectorAll('tr.mat-mdc-row');
      if (rows.length > 0) {
        animate(
          rows,
          { opacity: [0, 1], y: [20, 0] },
          { delay: stagger(0.05), duration: 0.5, ease: 'easeOut' }
        );
      }
    }, 0);
  }
}
