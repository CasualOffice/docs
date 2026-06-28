/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

import { type ClassValue, clsx } from 'clsx';

// Simple class name merger using clsx only
// Removed tailwind-merge to save ~69KB in bundle
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
