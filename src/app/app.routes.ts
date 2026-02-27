import {Routes} from '@angular/router';
import {Search} from './search';
import {Campaigns} from './campaigns';

export const routes: Routes = [
  { path: '', component: Search },
  { path: 'campaigns', component: Campaigns },
  { path: '**', redirectTo: '' }
];
