# Image Generation Feature

**Diff & Commit AI** includes AI-powered image generation, allowing you to create images directly from the Prompt Panel using image-capable models via OpenRouter.

## Quick Start

1. **Select an image-capable model** from the Model dropdown (e.g., `google/gemini-2.5-flash-preview-image`)
2. **Type an image request** in the Prompt Panel:
   - `generate image of a sunset over mountains`
   - `create an image of a coffee cup on a desk`
   - `image: a futuristic cityscape`
3. **Press Enter** or click Submit
4. **View, save, or regenerate** the image in the overlay viewer

## Trigger Keywords

The system detects image generation requests using these patterns:
- `generate image ...`
- `create image ...`
- `generate an image ...`
- `create an image ...`
- `image: ...`
- `[image] ...`

## Supported Models

The following models are known to support image generation:

| Provider | Models |
|----------|--------|
| **Google** | `google/gemini-2.5-flash-preview-image` |
| **Black Forest Labs** | `flux-1.1-pro`, `flux-1.1-pro-ultra`, `flux-schnell`, `flux-dev` |
| **OpenAI** | `dall-e-3`, `dall-e-2` |
| **Stability AI** | `stable-diffusion-xl`, `sdxl` |

> [!TIP]
> Any model with `image` in its ID is automatically detected as image-capable.

## Model Fallback

If your currently selected model doesn't support image generation, the system will:
1. Search your imported models for an image-capable alternative
2. Temporarily switch to that model for generation
3. Display which model was used in the console

## Image Viewer

When an image is generated, an overlay appears with:

- **Preview**: Full-size view of the generated image
- **Save**: Download the image as PNG with an auto-generated filename
- **Regenerate**: Generate a new image with the same prompt
- **Close**: Return to the normal diff view

## Technical Details

### Response Format

Images are returned from API in base64 format via the `message.images` array:

```json
{
  "choices": [{
    "message": {
      "content": "Optional text description",
      "images": [{
        "type": "image_url",
        "image_url": {
          "url": "data:image/png;base64,..."
        }
      }]
    }
  }]
}
```

### Service Architecture

| File | Purpose |
|------|---------|
| `imageGenerationService.ts` | API calls, model detection, response parsing |
| `ImageViewer.tsx` | Overlay UI component for image display |
| `AIContext.tsx` | State management (`generatedImage`, `isGeneratingImage`) |
| `UIContext.tsx` | Viewer visibility control (`showImageViewer`) |

### Key Functions

- `isImageCapableModel(modelId)` - Checks if a model supports image generation
- `isImageGenerationRequest(prompt)` - Detects if user wants to generate an image
- `extractImagePrompt(instruction)` - Removes trigger keywords from prompt
- `generateImage(prompt, model, editorContent?, signal?)` - Main generation function
- `generateFilename(prompt, maxLength?)` - Creates safe filenames for saving

## Troubleshooting

### No Image Generated

1. Check the browser console for `[ImageGen]` logs
2. Verify the model supports image generation
3. Ensure your OpenRouter API key has access to the model

### Wrong Model Used

The system automatically finds an image-capable model if one isn't selected. Check console logs to see which model was used.

### Image Not Displaying

The image is returned as a base64 data URL. If it's not displaying:
1. Check that `generatedImage` state is being set correctly
2. Verify the ImageViewer component is mounted
3. Check for console errors during response parsing
