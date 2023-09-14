const core = require('@actions/core');
const github = require('@actions/github');
const { template } = require("lodash");

const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");

function get_gh_labels() {

}
async function run() {
  try {
    // let token = core.getInput('token');
    const octokit = github.getOctokit('');

    const issues = (await octokit.rest.issues.listForRepo({
      owner: 'microsoft',
      repo: 'vscode-cmake-tools',
      state: 'open',
    })).data.filter(i => i.pull_request === undefined && i.labels.length === 0);

    // TODO get all labels
    const labels = (await octokit.rest.issues.listLabelsForRepo({
      owner: 'microsoft',
      repo: 'vscode-cmake-tools',
    })).data.map(i => i.name).join("', '");

    console.log(labels);

    let apiKey = "";//core.getInput('api_key');
    const client = new OpenAIClient(
      'https://americasopenai.azure-api.net',
      new AzureKeyCredential(apiKey)
    );

    var chatcmpl = {}
    var issueLabel = {}

    // iterate through issues to label
    issues.forEach(async (issue) => {
      // todo maybe play with how title and body are represented
      const issueText = issue.title + '. ' + issue.body.replace(/\n/g, ' ');
      const messages = [{ 'role': 'system', 'content': `You are a bot that matches one or more labels in a single line to each provided text in a single line: ${labels}` },];
      messages.push({ "role": "user", "content": issueText });
      const completion = client.listChatCompletions(
        "gpt-35-turbo-16k",
        messages
      );

      for await (const event of completion) {
        for (const choice of event.choices) {
          const delta = choice.delta?.content;
          if (delta !== undefined) {
            const resp = delta.replace(/\n/g, ' ');
            if (chatcmpl[event.id]) {
              chatcmpl[event.id] += resp;
            } else {
              chatcmpl[event.id] = resp;
            }
          }
        }
        issueLabel[issue.number] = `[ISSUE ${issue.number}][${issue.title}][${chatcmpl[event.id]}]`
        console.log(`[ISSUE ${issue.number}][${issue.title}][${chatcmpl[event.id]}]`);
      }
    });
  } catch (error) {
    core.setFailed(error.message);
  }
}

run()