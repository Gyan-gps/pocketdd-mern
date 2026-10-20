import { department } from './entities/department';
import { advertisment } from './entities/advertisment';
import { businessCategory } from './entities/business-category';
import { businessSubCategory } from './entities/business-sub-category';
import { location } from './entities/location';
import { slider } from './entities/slider';
import * as staffEvents from './entities/staff-events';
import { directoryUi } from './entities/directory';
import { businessUi } from './entities/business';
import type { EntityUi } from './types';

// One entry per ported Backpack CrudController.
const ENTITIES: Record<string, EntityUi> = {
  ...Object.fromEntries(directoryUi.map((e) => [e.route, e])),
  ...Object.fromEntries(businessUi.map((e) => [e.route, e])),
  [department.route]: department,
  ...Object.fromEntries([businessCategory, businessSubCategory, advertisment, slider, location].map((e) => [e.route, e])),
  ...Object.fromEntries(Object.values(staffEvents).map((e) => [e.route, e])),
};

export function getEntity(route: string): EntityUi | undefined {
  return ENTITIES[route];
}

export interface MenuItem {
  title: string;
  /** Line Awesome icon class (Backpack menu-item icon="la la-…"). */
  icon: string;
  route?: string;
  children?: MenuItem[];
}

// resources/views/vendor/backpack/ui/inc/menu_items.blade.php
export const MENU: MenuItem[] = [
  { title: 'Dashboard', icon: 'la-home', route: 'dashboard' },
  { title: 'Category Management', icon: 'la-th-list', route: 'business-category' },
  { title: 'Staff Management', icon: 'la-users-cog', route: 'business-user' },
  {
    title: 'Business',
    icon: 'la-briefcase',
    children: [
      { title: 'Businesses', icon: 'la-store', route: 'business' },
      { title: 'New Business Requests', icon: 'la-clipboard-check', route: 'business-request-managment' },
    ],
  },
  { title: 'Business owners', icon: 'la-user-tie', route: 'business-owner' },
  { title: 'Events Management', icon: 'la-calendar-check', route: 'event' },
  { title: 'Advertisement Management', icon: 'la-ad', route: 'advertisment' },
  {
    title: 'Administrators',
    icon: 'la-user-shield',
    children: [
      { title: 'Helpline Numbers', icon: 'la-phone-volume', route: 'city-helpline-number' },
      { title: 'Administrative Departments', icon: 'la-landmark', route: 'department' },
      { title: 'Officers Contact', icon: 'la-user-tie', route: 'administrator' },
    ],
  },
  {
    title: 'Address Management',
    icon: 'la-map',
    children: [
      { title: 'Area & Local Area', icon: 'la-location-arrow', route: 'address' },
      { title: 'Pin/State/District', icon: 'la-map-pin', route: 'pincode' },
    ],
  },
  { title: 'About Us', icon: 'la-info-circle', route: 'about-us' },
];
