'use client';

import { useEffect } from 'react';
import { getLocale, direction } from '@/lib/i18n';

export default function LocaleHandler() {
  useEffect(() => {
    const locale = getLocale();
    const dir = direction(locale);
    document.documentElement.dir = dir;
    document.documentElement.lang = locale;
  }, []);

  return null;
}
