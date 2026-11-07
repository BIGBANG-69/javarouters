/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import LanguageDetector, {
  type DetectorOptions,
} from 'i18next-browser-languagedetector'

import { convertDetectedLanguage, DEFAULT_INTERFACE_LANGUAGE } from './languages'

const DEFAULT_DETECTOR = 'javaroutersDefault'

/**
 * A language the visitor picked (stored in localStorage) wins; everyone else
 * gets the JavaRouters default instead of the browser language.
 */
export const detectionOptions: DetectorOptions = {
  order: ['localStorage', DEFAULT_DETECTOR],
  caches: ['localStorage'],
  // Stored values may be `zh-CN`/`zh-TW`/`zh`; map them onto our
  // `zhCN`/`zhTW` codes (other codes pass through unchanged).
  convertDetectedLanguage,
}

export function createLanguageDetector(): LanguageDetector {
  const detector = new LanguageDetector()
  detector.addDetector({
    name: DEFAULT_DETECTOR,
    lookup: () => DEFAULT_INTERFACE_LANGUAGE,
  })
  return detector
}
