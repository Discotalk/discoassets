from diffusers import StableDiffusionPipeline
import torch
import sys

model_id = sys.argv[1]
pipe = StableDiffusionPipeline.from_pretrained(model_id, torch_dtype=torch.float16).to("cuda")

prompt = sys.argv[2]

for i in range(96):
    print(f'Generating {i}')
    image = pipe(prompt, num_inference_steps=25, guidance_scale=7.5).images[0]
    image.save(f'out{i}.png')
