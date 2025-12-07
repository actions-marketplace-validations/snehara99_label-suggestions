const core = require("@actions/core");
const github = require("@actions/github");
const { template } = require("lodash");

const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");

async function run() {
  try {
    const repo = core.getInput('repo');
    const owner = core.getInput('owner');
    const token = core.getInput('token');
    const octokit = github.getOctokit(token);

    const issues = (
      await octokit.paginate(octokit.rest.issues.listForRepo, {
        owner: owner,
        repo: repo,
        state: "open",
        per_page: 100,
      })
    ).filter((i) => i.pull_request === undefined && i.labels.length === 0);

    const labels = (
      await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
        owner,
        repo,
      })
    ).map((i) => i.name)
      .join("', '");

    const apiKey = core.getInput('api-key');
    const endpoint = core.getInput('endpoint');
    const deploymentID = core.getInput('deployment-id');

    const client = new OpenAIClient(
      endpoint,
      new AzureKeyCredential(apiKey)
    );

    var issueLabels = {};

    const delayMS = 500;
    const delay = ms => new Promise(res => setTimeout(res, ms));

    // iterate through issues to label
    for (const issue of issues) {
      if (issue.body == null) {
        issue.body = '';
      }
      const issueText = issue.title + ". " + issue.body.replace(/\n/g, " ");
      const userMessageText = `${issueText}. Please liberally apply relevant labels to the provided text. Please provide results in a comma-separated list.`;
      const messages = [
        {
          role: "system",
          content: `The following is a conversation with an AI assistant for the ${owner}/${repo} public GitHub repository. The assistant is focused on assigning any of these labels: ${labels}, to issues presented.`,
        },
      ];
      messages.push({ role: "user", content: userMessageText });
      const completion = await client.getChatCompletions(
        deploymentID,
        messages,
        {
          temperature: 0.5,
          topP: 0.95,
          n: 1,
          maxTokens: 20
        }
      );
      const choice = completion.choices[0];
      issueLabels[
        issue.number
      ] = `[ISSUE ${issue.number}] ${issue.title}\n${issue.html_url}\n${choice.message.content}\n`
      console.log(
        `[ISSUE ${issue.number}] ${issue.title}\n${issue.html_url}\n${choice.message.content}\n`
      );
      await delay(delayMS);
    }
    core.setOutput("labels", issueLabels);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
