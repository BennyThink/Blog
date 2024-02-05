import {
  Box,
  ChakraProvider,
  Flex,
  VStack,
  Heading,
  Link as ChakraLink,
} from "@chakra-ui/react";
import * as React from "react";
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { Link as ReactRouterLink } from "react-router-dom";

import { ColorModeSwitcher } from "./ColorModeSwitcher";
import AppleTVPlus from "./AppleTVPlus";
import theme from "./theme";

const Welcome = () => {
  return (
    <div>
      <Heading>Welcome!</Heading>
      <br />

      <ChakraLink color="teal.500" as={ReactRouterLink} to="/apple-tv-plus">
        Apple TV+ Global Price
      </ChakraLink>
    </div>
  );
};

export const App = () => {
  return (
    <ChakraProvider theme={theme}>
      <Router>
        <Box textAlign="center" fontSize="xl">
          <Flex
            minH="20vh"
            p={1}
            alignItems="center"
            justifyContent="space-between"
          >
            <ColorModeSwitcher justifySelf="flex-end" />
          </Flex>

          <VStack spacing={4}>
            <Routes>
              <Route path="/" element={<Welcome />} />
              <Route path="/apple-tv-plus" element={<AppleTVPlus />} />
            </Routes>
          </VStack>
        </Box>
      </Router>
    </ChakraProvider>
  );
};
