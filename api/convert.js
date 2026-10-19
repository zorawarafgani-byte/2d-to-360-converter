export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { apiKey, imageBase64 } = req.body;

  if (!apiKey || !imageBase64) {
    return res.status(400).json({ message: 'Missing apiKey or imageBase64' });
  }

  try {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');

    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'image/png' });
    formData.append('file', blob, 'image.png');

    const uploadRes = await fetch('https://openapi.tripo3d.ai/v2/openapi/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData
    });

    const uploadData = await uploadRes.json();
    if (uploadData.code !== 0) throw new Error(uploadData.message || 'Image upload failed');

    const imageToken = uploadData.data.image_token;

    const taskRes = await fetch('https://openapi.tripo3d.ai/v2/openapi/task', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        type: 'image_to_model',
        file: { type: 'image_token', file_token: imageToken }
      })
    });

    const taskData = await taskRes.json();
    if (taskData.code !== 0) throw new Error(taskData.message || 'Task creation failed');

    const taskId = taskData.data.task_id;

    let modelUrl = null;
    let attempts = 0;
    while (!modelUrl && attempts < 30) {
      await new Promise(r => setTimeout(r, 2000));
      attempts++;

      const pollRes = await fetch(`https://openapi.tripo3d.ai/v2/openapi/task/${taskId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const pollData = await pollRes.json();

      if (pollData.data.status === 'success') {
        modelUrl = pollData.data.output.pbr_model || pollData.data.output.model;
        break;
      } else if (pollData.data.status === 'failed') {
        throw new Error('Tripo AI generation failed.');
      }
    }

    if (!modelUrl) throw new Error('Task timed out.');

    return res.status(200).json({ success: true, modelUrl });

  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}
