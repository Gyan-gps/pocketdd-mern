import { department } from './entities/department';
import { advertisment } from './entities/advertisment';
import { businessCategory } from './entities/business-category';
import { businessSubCategory } from './entities/business-sub-category';
import { location } from './entities/location';
import { slider } from './entities/slider';
import * as phase9c from './entities/phase9c';
import { phase9dUi } from './entities/phase9d';
import { phase9aUi } from './entities/phase9a';
import type { EntityUi } from './types';

// One entry per ported CrudController (Phase 9 adds the rest).
const ENTITIES: Record<string, EntityUi> = {
  ...Object.fromEntries(phase9dUi.map((e) => [e.route, e])),
  ...Object.fromEntries(phase9aUi.map((e) => [e.route, e])),
  [department.route]: department,
  ...Object.fromEntries([businessCategory, businessSubCategory, advertisment, slider, location].map((e) => [e.route, e])),
  ...Object.fromEntries(Object.values(phase9c).map((e) => [e.route, e])),
};

export function getEntity(route: string): EntityUi | undefined {
  return ENTITIES[route];
}

export interface MenuItem {
  title: string;
  icon: string;
  route?: string;
  children?: MenuItem[];
}

// resources/views/vendor/backpack/ui/inc/menu_items.blade.php
export const MENU: MenuItem[] = [
  { title: 'Dashboard', icon: '🏠', route: 'dashboard' },
  { title: 'Category Management', icon: '☰', route: 'business-category' },
  { title: 'Staff Management', icon: '👥', route: 'business-user' },
  {
    title: 'Business',
    icon: '💼',
    children: [
      { title: 'Businesses', icon: '🏪', route: 'business' },
      { title: 'New Business Requests', icon: '📋', route: 'business-request-managment' },
    ],
  },
  { title: 'Business owners', icon: '👔', route: 'business-owner' },
  { title: 'Events Management', icon: '📅', route: 'event' },
  { title: 'Advertisement Management', icon: '📢', route: 'advertisment' },
  {
    title: 'Administrators',
    icon: '🛡',
    children: [
      { title: 'Helpline Numbers', icon: '📞', route: 'city-helpline-number' },
      { title: 'Administrative Departments', icon: '🏛', route: 'department' },
      { title: 'Officers Contact', icon: '👔', route: 'administrator' },
    ],
  },
  {
    title: 'Address Management',
    icon: '🗺',
    children: [
      { title: 'Area & Local Area', icon: '📍', route: 'address' },
      { title: 'Pin/State/District', icon: '📌', route: 'pincode' },
    ],
  },
  { title: 'About Us', icon: 'ℹ', route: 'about-us' },
];
