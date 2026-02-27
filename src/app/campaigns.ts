import { ChangeDetectionStrategy, Component, signal, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import { SearchService, Campaign, BusinessResult } from './search.service';
import { LocalStorageService } from './local-storage.service';
import { BusinessDetails } from './business-details';
import * as XLSX from 'xlsx';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-campaigns',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
    MatInputModule,
    MatProgressSpinnerModule,
    FormsModule
  ],
  templateUrl: './campaigns.html',
  styleUrl: './app.css'
})
export class Campaigns implements OnInit {
  private searchService = inject(SearchService);
  private localStorageService = inject(LocalStorageService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  campaigns = signal<Campaign[]>([]);
  selectedCampaign = signal<Campaign | null>(null);
  isLoading = signal(false);
  searchTerm = signal('');

  filteredCampaigns = computed(() => {
    const term = this.searchTerm().toLowerCase();
    return this.campaigns().filter(c => 
      c.name.toLowerCase().includes(term) || 
      (c.keyword?.toLowerCase().includes(term)) ||
      (c.city?.toLowerCase().includes(term))
    );
  });

  displayedColumns: string[] = ['name', 'date', 'count', 'actions'];
  businessColumns: string[] = ['title', 'address', 'website', 'email', 'actions'];

  ngOnInit() {
    this.loadCampaigns();
  }

  loadCampaigns() {
    this.isLoading.set(true);
    this.searchService.getCampaigns().subscribe({
      next: (data) => {
        this.campaigns.set(data);
        this.localStorageService.saveCampaigns(data);
        this.isLoading.set(false);
      },
      error: () => {
        const localData = this.localStorageService.loadCampaigns();
        if (localData.length > 0) {
          this.campaigns.set(localData);
          this.snackBar.open('Chargement depuis le stockage local (Hors-ligne)', 'Fermer', { duration: 3000 });
        } else {
          this.snackBar.open('Erreur de chargement', 'Fermer', { duration: 3000 });
        }
        this.isLoading.set(false);
      }
    });
  }

  viewCampaign(id: number) {
    this.isLoading.set(true);
    this.searchService.getCampaign(id).subscribe({
      next: (data) => {
        this.selectedCampaign.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        this.snackBar.open('Erreur de chargement', 'Fermer', { duration: 3000 });
        this.isLoading.set(false);
      }
    });
  }

  deleteCampaign(id: number) {
    if (confirm('Supprimer cette campagne ?')) {
      this.searchService.deleteCampaign(id).subscribe(() => {
        this.loadCampaigns();
        if (this.selectedCampaign()?.id === id) this.selectedCampaign.set(null);
        this.snackBar.open('Supprimée', 'Fermer', { duration: 2000 });
      });
    }
  }

  exportCampaign(campaign: Campaign) {
    if (!campaign.results) return;
    const data = campaign.results.map(r => ({ 
      'Nom': r.title, 
      'Email': r.email || '', 
      'Site': r.website || '', 
      'Tel': r.phoneNumber || '', 
      'Adresse': r.address,
      'Catégorie': r.category || '',
      'Note': r.rating || '',
      'Avis': r.ratingCount || ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Prospects');
    XLSX.writeFile(wb, `${campaign.name.replace(/ /g, '_')}.xlsx`);
  }

  openDetails(business: BusinessResult) {
    this.dialog.open(BusinessDetails, { data: business, width: '640px', maxWidth: '95vw', panelClass: 'custom-dialog-container' });
  }
}
