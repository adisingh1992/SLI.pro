import fetch from 'node-fetch';

async function main() {
  try {
    // 1. Attempt to login
    console.log('Attempting to login...');
    const loginResponse = await fetch('http://localhost:5000/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: "aditya@cooeyhealth.com",
        password: "@lec177fig600",
      }),
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed with status ${loginResponse.status}`);
    }

    const userData = await loginResponse.json();
    console.log('Login successful. User data:', userData);

    // 2. Check if we can get the user profile now
    console.log('\nFetching user profile...');
    const userResponse = await fetch('http://localhost:5000/api/user', {
      headers: {
        Cookie: loginResponse.headers.get('set-cookie'),
      },
    });

    if (!userResponse.ok) {
      throw new Error(`Failed to fetch user profile: ${userResponse.status}`);
    }

    const profile = await userResponse.json();
    console.log('User profile retrieved:', profile);

    // 3. Try to get freshness reports for the user
    console.log('\nFetching latest freshness report...');
    const reportResponse = await fetch('http://localhost:5000/api/freshness-reports/latest', {
      headers: {
        Cookie: loginResponse.headers.get('set-cookie'),
      },
    });

    if (reportResponse.status === 404) {
      console.log('No freshness report found (404) - this is expected if no reports exist yet');
    } else if (!reportResponse.ok) {
      throw new Error(`Failed to fetch freshness report: ${reportResponse.status}`);
    } else {
      const report = await reportResponse.json();
      console.log('Latest freshness report retrieved:', report);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();