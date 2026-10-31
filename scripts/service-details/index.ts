// Barrel: merges all per-category service detail maps + category FAQs.
import { ServiceDetailData } from './types'
import { DETAILS_A_B } from './cat-a-b'
import { DETAILS_C_D } from './cat-c-d'
import { DETAILS_E_F } from './cat-e-f'
import { DETAILS_G_H } from './cat-g-h'
import { DETAILS_I_J } from './cat-i-j'
import { DETAILS_K_L } from './cat-k-l'
import { DETAILS_M_N } from './cat-m-n'
import { DETAILS_O_P } from './cat-o-p'
import { CATEGORY_FAQS } from './faqs'

export const SERVICE_DETAILS: Record<string, ServiceDetailData> = {
  ...DETAILS_A_B, ...DETAILS_C_D, ...DETAILS_E_F, ...DETAILS_G_H,
  ...DETAILS_I_J, ...DETAILS_K_L, ...DETAILS_M_N, ...DETAILS_O_P,
}

export { CATEGORY_FAQS }
