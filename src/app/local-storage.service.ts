import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class LocalStorageService {
  public platformId = inject(PLATFORM_ID);
  private readonly CAMPAIGNS_KEY = 'ai_maps_campaigns_backup';
  private readonly DRAFT_KEY = 'ai_maps_current_draft';

  saveCampaigns(campaigns: any[]) {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.CAMPAIGNS_KEY, JSON.stringify(campaigns));
    }
  }

  loadCampaigns(): any[] {
    if (isPlatformBrowser(this.platformId)) {
      const data = localStorage.getItem(this.CAMPAIGNS_KEY);
      return data ? JSON.parse(data) : [];
    }
    return [];
  }

  saveDraft(draft: any) {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.DRAFT_KEY, JSON.stringify(draft));
    }
  }

  loadDraft(): any | null {
    if (isPlatformBrowser(this.platformId)) {
      const data = localStorage.getItem(this.DRAFT_KEY);
      return data ? JSON.parse(data) : null;
    }
    return null;
  }

  clearDraft() {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(this.DRAFT_KEY);
    }
  }
}
