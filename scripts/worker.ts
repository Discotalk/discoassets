
const API_KEY = Deno.env.get("API_KEY");

// const API_HOST = 'http://localhost:3000';
const API_HOST = 'http://discotalk.app/api/train_jobs';

async function fetchJobs() {
    const response = await fetch(`${API_HOST}/api/train_jobs`, {
        headers: {
            "x-api-key": API_KEY
        }
    });

    const trainJobs = await response.json();

    return trainJobs;
}

async function postJobResult(id: string, status: string, result: any) {
    console.info(`Posting job result for ${id}, status: ${status}, result: ${result}`);

    const response = await fetch(`${API_HOST}/api/train_jobs`, {
        method: "POST",
        headers: {
            "x-api-key": API_KEY,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            id,
            status,
            result
        })
    });

    return response;
}

async function prepareJob(job: any) {
    // create job directory
    const jobDir = `./jobs/${job.id}`;
    await Deno.mkdir(jobDir, { recursive: true });

    // write job params to file
    const paramsFile = `${jobDir}/params.json`;
    await Deno.writeTextFile(paramsFile, JSON.stringify(job.params));

    // write job script to file
    const scriptFile = `${jobDir}/script.sh`;
    await Deno.writeTextFile(scriptFile, job.script);

    return {
        jobDir,
        paramsFile,
        scriptFile
    };
}

async function downloadJobInputAssets(job: any) {
    const jobDir = `./jobs/${job.id}`;
    await Deno.mkdir(jobDir, { recursive: true });

    const assetsDir = `${jobDir}/input`;
    await Deno.mkdir(assetsDir, { recursive: true });

    if (!job.input_assets) {
        return;
    }

    for (const asset of job.input_assets) {
        console.info(`Downloading asset ${asset.name} for job ${job.id}`);
        const assetPath = `${assetsDir}/${asset.name}`;
        const res = await fetch(asset.url);

        if (!res.body) {
            console.info(`Asset ${asset.name} is empty`);
            continue;
        }

        const file = await Deno.open(assetPath, { create: true, write: true });

        await res.body.pipeTo(file.writable);
    }

    return assetsDir;
}

async function runJobInSubprocess(job: any) {
    const { jobDir } = await prepareJob(job);

    await downloadJobInputAssets(job);

    console.info(`Running job ${job.id} in subprocess, path: ${jobDir}`);

    const python = Deno.run({
        cmd: [
            "bash",
            "script.sh"
        ],
        cwd: jobDir,
        stdout: "piped",
        stderr: "piped"
    });

    const status = await python.status();

    const rawOutput = await python.output();
    const output = new TextDecoder().decode(rawOutput);

    const rawError = await python.stderrOutput();
    const error = new TextDecoder().decode(rawError);

    if (status.success) {
        console.info(`Job ${job.id} finished successfully`);
        await postJobResult(job.id, "success", output);
    } else {
        console.error(`Job ${job.id} failed`);
        await postJobResult(job.id, "error", error);
    }
}

async function run() {
    const trainJobs = await fetchJobs();

    if (!trainJobs.items) {
        console.info(`No train jobs to run`);
        // Retry in 5 seconds
        setTimeout(run, 5000);
        return;
    }

    console.info(`Got ${trainJobs.items.length} train jobs`);

    for (const job of trainJobs.items) {
        await runJobInSubprocess(job);
    }

    setTimeout(run, 0);
}

run();