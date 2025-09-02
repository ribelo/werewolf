export const VALIDATION = {
  // Weight increments and limits
  WEIGHT_INCREMENT: 0.25,
  MAX_PLATE_WEIGHT: 50,
  MAX_BAR_WEIGHT: 100,
  MAX_PLATE_QUANTITY: 20,
  
  // Minimum lengths
  MIN_NAME_LENGTH: 2,
  MIN_LOCATION_LENGTH: 2,
  
  // Debounce timing
  QUANTITY_UPDATE_DELAY: 300,
} as const;