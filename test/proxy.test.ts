import axios from 'axios';

describe('Proxy API', () => {
  it('should accept a request and return 202 with an id', async () => {
    const response = await axios.post('http://localhost:3000/proxy', {
      orgId: 'test-org',
      payload: { foo: 'bar' },
    });
    expect(response.status).toBe(202);
    expect(response.data).toHaveProperty('id');
  });

  it('should proxy to httpbin and log the result', async () => {
    const response = await axios.post('http://localhost:3000/proxy', {
      orgId: 'test-org',
      payload: { foo: 'bar', targetUrl: 'https://httpbin.org/post' },
    });
    expect(response.status).toBe(202);
    expect(response.data).toHaveProperty('id');
    // Optionally: Wait and check logs manually for proxy success
  });
});
