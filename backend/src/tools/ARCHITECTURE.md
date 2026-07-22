## ORCGESTRATOR - AGENT
- Knows about agents described below
- follows written pipeline
- calls agent based on described pipeline
- if QA-AGENT returns FAIL -> call PIXELIZE-AGENT with RETRY_PARAMS (max 2 retries, after that returns the last result)
- returns a final result 
- notifies user about every step


## VISION-AGENT
- Receives an image, makes analysis and makes decision which style has to be applies
- Returns valid JSON with param style

## PIXELIZE-AGENT
- Receives an image and style
- Returns path to process image file

## QA-AGENT
- Recieves original image, style, and processed image
- Analyze if the style was applied correctly
- Return PASS if everythin is okay and FAIL + RETRY_PARAMS+DESCRIPTION