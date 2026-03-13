import { render, screen } from "@testing-library/react";
import App from "./App";

jest.mock("./pages/Home", () => () => <div>Dlivery Home</div>);

test("renderiza la aplicación", () => {
  render(<App />);
  expect(screen.getByText(/Dlivery Home/i)).toBeInTheDocument();
});
