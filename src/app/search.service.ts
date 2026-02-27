import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface BusinessResult {
  title: string;
  address: string;
  phoneNumber?: string;
  website?: string;
  rating?: number;
  ratingCount?: number;
  category?: string;
  email?: string;
  description?: string;
  hours?: any;
  cid?: string;
  thumbnailUrl?: string;
  mapsUrl?: string;
  images?: string[];
  websitePrompt?: string;
  reviews?: {
    user: string;
    rating: number;
    snippet: string;
    date?: string;
  }[];
  about?: {
    category: string;
    items: string[];
  }[];
}

export interface SerperResponse {
  places: BusinessResult[];
}

export interface EnrichmentResponse {
  email?: string;
  description?: string;
  images?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class SearchService {
  private http = inject(HttpClient);

  search(keyword: string, city: string): Observable<SerperResponse> {
    return this.http.post<SerperResponse>('/api/search', { keyword, city });
  }

  enrich(website: string): Observable<EnrichmentResponse> {
    return this.http.post<EnrichmentResponse>('/api/enrich', { website });
  }

  scrapeImages(url: string): Observable<{ images: string[] }> {
    return this.http.post<{ images: string[] }>('/api/scrape-images', { url });
  }
}
